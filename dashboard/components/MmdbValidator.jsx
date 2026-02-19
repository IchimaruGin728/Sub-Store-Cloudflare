import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from './Toast';
import Footer from './Footer';

let mmdbRuntimePromise = null;

async function loadMmdbRuntime() {
    if (!mmdbRuntimePromise) {
        mmdbRuntimePromise = import('buffer').then(async (bufferModule) => {
            const BufferCtor = bufferModule?.Buffer;
            if (!BufferCtor) {
                throw new Error('无法加载 Buffer 运行时');
            }

            globalThis.Buffer = BufferCtor;

            const mmdbModule = await import('mmdb-lib');

            return {
                BufferCtor,
                mmdbApi: mmdbModule,
            };
        });
    }
    return mmdbRuntimePromise;
}

const DEFAULT_SAMPLE_IPS = [
    '223.5.5.5',
    '223.6.6.6',
    '119.29.29.29',
    '180.76.76.76',
    '114.114.114.114',
    '1.1.1.1',
    '1.0.0.1',
    '8.8.8.8',
    '8.8.4.4',
    '9.9.9.9',
    '208.67.222.222',
    '94.140.14.14',
    '2001:4860:4860::8888',
    '2001:4860:4860::8844',
    '2606:4700:4700::1111',
    '2606:4700:4700::1001',
    '2620:fe::fe',
    '2620:119:35::35',
    '2400:3200::1',
    '2400:3200:baba::1',
];

const EXPECTED_COUNTRY_BEHAVIOR = '应返回 country.iso_code 或 registered_country.iso_code 的 2 位国家代码';
const EXPECTED_ASN_BEHAVIOR = '应同时返回 autonomous_system_number(数字) 与 autonomous_system_organization(字符串)';

function normalizeIpList(raw) {
    if (!raw) return [];
    const values = raw
        .split(/[\s,;]+/)
        .map(v => v.trim())
        .filter(Boolean);
    return [...new Set(values)];
}

function toIsoOrNull(value) {
    if (typeof value !== 'string') return null;
    const code = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
}

function toFiniteNumberOrNull(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function toStringOrNull(value) {
    if (typeof value !== 'string') return null;
    const out = value.trim();
    return out.length > 0 ? out : null;
}

function formatBuildEpoch(input) {
    if (!input) return '未知';
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
        return input.toLocaleString();
    }
    const dt = new Date(input);
    if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleString();
    }
    return String(input);
}

async function readMmdbReader(file) {
    const { BufferCtor, mmdbApi } = await loadMmdbRuntime();
    if (typeof globalThis.Buffer === 'undefined') {
        globalThis.Buffer = BufferCtor;
    }
    const arrayBuffer = await file.arrayBuffer();
    const reader = new mmdbApi.Reader(BufferCtor.from(arrayBuffer));
    return {
        reader,
        metadata: reader.metadata || null,
        size: file.size,
        filename: file.name,
    };
}

function probeCountryReader(reader, ips) {
    const checks = ips.map((ip) => {
        try {
            const record = reader.get(ip);
            const countryIso = toIsoOrNull(record?.country?.iso_code);
            const registeredCountryIso = toIsoOrNull(record?.registered_country?.iso_code);
            const hit = Boolean(countryIso || registeredCountryIso);
            return {
                ip,
                hit,
                actualBehavior: `country.iso_code=${countryIso || '-'}; registered_country.iso_code=${registeredCountryIso || '-'}`,
                countryIso,
                registeredCountryIso,
                reason: hit ? '' : '未命中 country.iso_code / registered_country.iso_code',
            };
        } catch (error) {
            return {
                ip,
                hit: false,
                actualBehavior: '查询异常',
                countryIso: null,
                registeredCountryIso: null,
                reason: error instanceof Error ? error.message : String(error),
            };
        }
    });

    const matched = checks.filter(item => item.hit).length;
    return {
        checks,
        matched,
        hasRequiredFields: matched > 0,
    };
}

function probeAsnReader(reader, ips) {
    const checks = ips.map((ip) => {
        try {
            const record = reader.get(ip);
            const asnNumber = toFiniteNumberOrNull(record?.autonomous_system_number);
            const asnOrg = toStringOrNull(record?.autonomous_system_organization);
            const hasBoth = asnNumber !== null && asnOrg !== null;
            return {
                ip,
                hit: hasBoth,
                actualBehavior: `autonomous_system_number=${asnNumber ?? '-'}; autonomous_system_organization=${asnOrg || '-'}`,
                asnNumber,
                asnOrg,
                reason: hasBoth ? '' : '未同时命中 autonomous_system_number + autonomous_system_organization',
            };
        } catch (error) {
            return {
                ip,
                hit: false,
                actualBehavior: '查询异常',
                asnNumber: null,
                asnOrg: null,
                reason: error instanceof Error ? error.message : String(error),
            };
        }
    });

    const matched = checks.filter(item => item.hit).length;
    return {
        checks,
        matched,
        hasRequiredFields: matched > 0,
    };
}

function validateByKind({ kind, metadata, probe }) {
    const warnings = [];
    const errors = [];
    const dbType = String(metadata?.databaseType || '');

    if (kind === 'country') {
        if (dbType && !/country/i.test(dbType)) {
            warnings.push(`database_type="${dbType}" 不是常见 Country 库标识`);
        }
        if (!probe.hasRequiredFields) {
            errors.push('样本 IP 未命中 country.iso_code 或 registered_country.iso_code');
        }
    }

    if (kind === 'asn') {
        if (dbType && !/asn/i.test(dbType)) {
            warnings.push(`database_type="${dbType}" 不是常见 ASN 库标识`);
        }
        if (!probe.hasRequiredFields) {
            errors.push('样本 IP 未同时命中 autonomous_system_number 和 autonomous_system_organization');
        }
    }

    return {
        ok: errors.length === 0,
        warnings,
        errors,
    };
}

function buildReportPayload({ countryResult, asnResult, sampleIps, generatedAt }) {
    const toExport = (result) => {
        if (!result) return null;
        return {
            kind: result.kind,
            ok: result.ok,
            filename: result.filename,
            size: result.size,
            metadata: result.metadata,
            warnings: result.warnings,
            errors: result.errors,
            matched: result.probe.matched,
            checks: result.probe.checks,
        };
    };

    return {
        generatedAt,
        sampleIps,
        summary: {
            countryOk: Boolean(countryResult?.ok),
            asnOk: Boolean(asnResult?.ok),
            allOk: Boolean(countryResult?.ok && asnResult?.ok),
        },
        country: toExport(countryResult),
        asn: toExport(asnResult),
    };
}

const MmdbValidator = () => {
    const navigate = useNavigate();
    const toast = useToast();

    const [countryFile, setCountryFile] = useState(null);
    const [asnFile, setAsnFile] = useState(null);
    const [customIps, setCustomIps] = useState('');
    const [validating, setValidating] = useState(false);
    const [generatedAt, setGeneratedAt] = useState('');
    const [countryResult, setCountryResult] = useState(null);
    const [asnResult, setAsnResult] = useState(null);

    const sampleIps = useMemo(() => {
        const custom = normalizeIpList(customIps);
        return [...new Set([...custom, ...DEFAULT_SAMPLE_IPS])];
    }, [customIps]);

    const summary = useMemo(() => {
        if (!countryResult || !asnResult) return 'unknown';
        if (countryResult.ok && asnResult.ok) return 'pass';
        if (countryResult.ok || asnResult.ok) return 'partial';
        return 'fail';
    }, [countryResult, asnResult]);

    const runValidation = async () => {
        if (!countryFile || !asnFile) {
            toast.error('请同时选择 Country.mmdb 与 Country-asn.mmdb');
            return;
        }

        setValidating(true);
        setCountryResult(null);
        setAsnResult(null);

        try {
            const countryParsed = await readMmdbReader(countryFile);
            const countryProbe = probeCountryReader(countryParsed.reader, sampleIps);
            const countryJudge = validateByKind({
                kind: 'country',
                metadata: countryParsed.metadata,
                probe: countryProbe,
            });

            const asnParsed = await readMmdbReader(asnFile);
            const asnProbe = probeAsnReader(asnParsed.reader, sampleIps);
            const asnJudge = validateByKind({
                kind: 'asn',
                metadata: asnParsed.metadata,
                probe: asnProbe,
            });

            const countryOut = {
                kind: 'country',
                ok: countryJudge.ok,
                filename: countryParsed.filename,
                size: countryParsed.size,
                metadata: countryParsed.metadata,
                probe: countryProbe,
                warnings: countryJudge.warnings,
                errors: countryJudge.errors,
            };

            const asnOut = {
                kind: 'asn',
                ok: asnJudge.ok,
                filename: asnParsed.filename,
                size: asnParsed.size,
                metadata: asnParsed.metadata,
                probe: asnProbe,
                warnings: asnJudge.warnings,
                errors: asnJudge.errors,
            };

            setCountryResult(countryOut);
            setAsnResult(asnOut);
            setGeneratedAt(new Date().toISOString());

            if (countryOut.ok && asnOut.ok) {
                toast.success('校验通过：两份 MMDB 均符合当前项目字段要求');
            } else if (countryOut.ok || asnOut.ok) {
                toast.warning('部分通过：请查看失败项并更换对应 MMDB');
            } else {
                toast.error('校验失败：两份 MMDB 都不符合字段要求');
            }
        } catch (error) {
            toast.error(`校验异常：${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setValidating(false);
        }
    };

    const exportReport = () => {
        if (!countryResult || !asnResult) {
            toast.info('请先执行一次校验');
            return;
        }

        const payload = buildReportPayload({
            countryResult,
            asnResult,
            sampleIps,
            generatedAt: generatedAt || new Date().toISOString(),
        });

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mmdb-validation-report-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
                <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/settings')}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-white font-bold text-lg">MMDB 校验工具</p>
                            <p className="text-gray-400 text-xs">浏览器本地校验</p>
                        </div>
                    </div>
                    <button
                        onClick={exportReport}
                        className="px-4 py-2 rounded-lg bg-slate-700 text-gray-200 hover:bg-slate-600 transition-colors"
                    >
                        导出报告
                    </button>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
                <section className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                    <div className="text-sm text-gray-300 leading-relaxed">
                        本工具不上传文件，不调用任何 API。仅在浏览器本地解析 MMDB，并按当前项目运行时字段要求进行校验。
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                            <span className="block text-white text-sm font-medium mb-2">Country.mmdb</span>
                            <input
                                type="file"
                                accept=".mmdb"
                                onChange={e => setCountryFile(e.target.files?.[0] || null)}
                                className="w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:px-4 file:py-2 file:text-cyan-200 hover:file:bg-cyan-500/30"
                            />
                        </label>

                        <label className="block">
                            <span className="block text-white text-sm font-medium mb-2">Country-asn.mmdb</span>
                            <input
                                type="file"
                                accept=".mmdb"
                                onChange={e => setAsnFile(e.target.files?.[0] || null)}
                                className="w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-purple-500/20 file:px-4 file:py-2 file:text-purple-200 hover:file:bg-purple-500/30"
                            />
                        </label>
                    </div>

                    <div>
                        <label className="block text-white text-sm font-medium mb-2">
                            自定义样本 IP（可选，逗号/空格/换行分隔）
                        </label>
                        <textarea
                            value={customIps}
                            onChange={e => setCustomIps(e.target.value)}
                            rows={3}
                            placeholder="例如: 1.1.1.1, 8.8.8.8"
                            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                        <p className="text-xs text-gray-500 mt-2">当前参与校验样本数：{sampleIps.length}</p>
                    </div>

                    <button
                        onClick={runValidation}
                        disabled={validating}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {validating ? '校验中...' : '开始校验'}
                    </button>
                </section>

                {summary !== 'unknown' && (
                    <section className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="text-sm text-gray-400">综合结果</p>
                                <p className={`text-2xl font-bold ${summary === 'pass' ? 'text-emerald-400' : summary === 'partial' ? 'text-amber-400' : 'text-red-400'}`}>
                                    {summary === 'pass' ? 'PASS' : summary === 'partial' ? 'PASS_WITH_WARNINGS' : 'FAIL'}
                                </p>
                            </div>
                            <div className="text-xs text-gray-500">上次校验时间：{generatedAt ? new Date(generatedAt).toLocaleString() : '-'}</div>
                        </div>
                    </section>
                )}

                {[countryResult, asnResult].filter(Boolean).map((result) => (
                    <section key={result.kind} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-white">{result.kind === 'country' ? 'Country 库结果' : 'ASN 库结果'}</h2>
                                <p className="text-sm text-gray-400">{result.filename} · {(result.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${result.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                {result.ok ? '通过' : '失败'}
                            </span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                            <div className="bg-slate-800/60 rounded-lg p-3"><span className="text-gray-400">database_type</span><p className="text-white break-all">{result.metadata?.databaseType || '未知'}</p></div>
                            <div className="bg-slate-800/60 rounded-lg p-3"><span className="text-gray-400">IP 版本</span><p className="text-white">{result.metadata?.ipVersion ?? '未知'}</p></div>
                            <div className="bg-slate-800/60 rounded-lg p-3"><span className="text-gray-400">record_size</span><p className="text-white">{result.metadata?.recordSize ?? '未知'}</p></div>
                            <div className="bg-slate-800/60 rounded-lg p-3"><span className="text-gray-400">构建时间</span><p className="text-white">{formatBuildEpoch(result.metadata?.buildEpoch)}</p></div>
                        </div>

                        <div className="md:hidden space-y-2">
                            <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-3">
                                <p className="text-xs text-gray-400">规则</p>
                                <p className="text-sm text-white mt-1">核心字段校验</p>
                                <p className="text-xs text-gray-400 mt-2">预期行为</p>
                                <p className="text-sm text-gray-200 mt-1">{result.kind === 'country' ? EXPECTED_COUNTRY_BEHAVIOR : EXPECTED_ASN_BEHAVIOR}</p>
                                <p className="text-xs text-gray-400 mt-2">实际行为</p>
                                <p className="text-sm text-gray-200 mt-1">样本命中 {result.probe.matched}/{result.probe.checks.length}</p>
                                <p className={`text-sm font-medium mt-2 ${result.probe.hasRequiredFields ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {result.probe.hasRequiredFields ? '通过' : '失败'}
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-3">
                                <p className="text-xs text-gray-400">规则</p>
                                <p className="text-sm text-white mt-1">database_type 建议</p>
                                <p className="text-xs text-gray-400 mt-2">预期行为</p>
                                <p className="text-sm text-gray-200 mt-1">{result.kind === 'country' ? '应包含 Country 关键字' : '应包含 ASN 关键字'}</p>
                                <p className="text-xs text-gray-400 mt-2">实际行为</p>
                                <p className="text-sm text-gray-200 mt-1 break-all">{result.metadata?.databaseType || '未知'}</p>
                                <p className={`text-sm font-medium mt-2 ${result.warnings.length > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                                    {result.warnings.length > 0 ? '警告' : '通过'}
                                </p>
                            </div>

                            {result.errors.map((item) => (
                                <div key={`error-mobile-${item}`} className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                                    <p className="text-xs text-red-200">错误</p>
                                    <p className="text-sm text-red-100 mt-1">{item}</p>
                                </div>
                            ))}

                            {result.warnings.map((item) => (
                                <div key={`warn-mobile-${item}`} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                                    <p className="text-xs text-amber-200">警告</p>
                                    <p className="text-sm text-amber-100 mt-1">{item}</p>
                                </div>
                            ))}
                        </div>

                        <div className="hidden md:block overflow-auto max-h-72 rounded-xl border border-slate-700/60">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="text-left text-gray-300 border-b border-slate-700 bg-slate-900/60">
                                        <th className="py-2 px-3">规则</th>
                                        <th className="py-2 px-3">预期行为</th>
                                        <th className="py-2 px-3">实际行为</th>
                                        <th className="py-2 px-3">状态</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-slate-800/70 align-top">
                                        <td className="py-2 px-3 text-gray-200">核心字段校验</td>
                                        <td className="py-2 px-3 text-gray-300">
                                            {result.kind === 'country' ? EXPECTED_COUNTRY_BEHAVIOR : EXPECTED_ASN_BEHAVIOR}
                                        </td>
                                        <td className="py-2 px-3 text-gray-300">
                                            样本命中 {result.probe.matched}/{result.probe.checks.length}
                                        </td>
                                        <td className={`py-2 px-3 font-medium ${result.probe.hasRequiredFields ? 'text-emerald-300' : 'text-red-300'}`}>
                                            {result.probe.hasRequiredFields ? '通过' : '失败'}
                                        </td>
                                    </tr>
                                    <tr className="border-b border-slate-800/70 align-top">
                                        <td className="py-2 px-3 text-gray-200">database_type 建议</td>
                                        <td className="py-2 px-3 text-gray-300">
                                            {result.kind === 'country' ? '应包含 Country 关键字' : '应包含 ASN 关键字'}
                                        </td>
                                        <td className="py-2 px-3 text-gray-300 break-all">{result.metadata?.databaseType || '未知'}</td>
                                        <td className={`py-2 px-3 font-medium ${result.warnings.length > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                                            {result.warnings.length > 0 ? '警告' : '通过'}
                                        </td>
                                    </tr>
                                    {result.errors.map((item) => (
                                        <tr key={`error-${item}`} className="border-b border-slate-800/70 align-top">
                                            <td className="py-2 px-3 text-red-300">错误</td>
                                            <td className="py-2 px-3 text-gray-300">
                                                {result.kind === 'country' ? EXPECTED_COUNTRY_BEHAVIOR : EXPECTED_ASN_BEHAVIOR}
                                            </td>
                                            <td className="py-2 px-3 text-gray-300">{item}</td>
                                            <td className="py-2 px-3 text-red-300 font-medium">失败</td>
                                        </tr>
                                    ))}
                                    {result.warnings.map((item) => (
                                        <tr key={`warn-${item}`} className="border-b border-slate-800/70 align-top">
                                            <td className="py-2 px-3 text-amber-300">警告</td>
                                            <td className="py-2 px-3 text-gray-300">
                                                {result.kind === 'country' ? 'database_type 包含 Country' : 'database_type 包含 ASN'}
                                            </td>
                                            <td className="py-2 px-3 text-gray-300">{item}</td>
                                            <td className="py-2 px-3 text-amber-300 font-medium">警告</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="md:hidden overflow-auto max-h-96 space-y-2">
                            {result.probe.checks.map((check) => (
                                <div key={`mobile-${check.ip}`} className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs text-gray-400">IP</p>
                                            <p className="text-sm text-white font-mono mt-1 break-all">{check.ip}</p>
                                        </div>
                                        <span className={`text-sm font-medium ${check.hit ? 'text-emerald-300' : 'text-red-300'}`}>{check.hit ? '命中' : '未命中'}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">实际行为</p>
                                    <p className="text-sm text-gray-200 mt-1 break-all">{check.actualBehavior}</p>
                                    <p className="text-xs text-gray-400 mt-2">说明</p>
                                    <p className="text-sm text-gray-300 mt-1">{check.reason || '-'}</p>
                                </div>
                            ))}
                        </div>

                        <div className="hidden md:block overflow-auto max-h-96 rounded-xl border border-slate-700/60">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 border-b border-slate-700 bg-slate-900/60">
                                        <th className="py-2 px-3">IP</th>
                                        <th className="py-2 px-3">命中</th>
                                        <th className="py-2 px-3">实际行为</th>
                                        <th className="py-2 px-3">说明</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.probe.checks.map((check) => (
                                        <tr key={check.ip} className="border-b border-slate-800/70 align-top">
                                            <td className="py-2 px-3 text-gray-200 font-mono">{check.ip}</td>
                                            <td className={`py-2 px-3 ${check.hit ? 'text-emerald-300' : 'text-red-300'}`}>{check.hit ? '是' : '否'}</td>
                                            <td className="py-2 px-3 text-gray-200 break-all">{check.actualBehavior}</td>
                                            <td className="py-2 px-3 text-gray-400">{check.reason || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))}
            </main>

            <Footer />
        </div>
    );
};

export default MmdbValidator;
