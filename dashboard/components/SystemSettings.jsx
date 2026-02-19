import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import Footer from './Footer';

const SystemSettings = () => {
    const navigate = useNavigate();
    const { token } = useAuth();
    const toast = useToast();

    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mmdbUpdating, setMmdbUpdating] = useState(false);
    const [mmdbMetaLoading, setMmdbMetaLoading] = useState(false);
    const [mmdbFiles, setMmdbFiles] = useState([]);

    useEffect(() => {
        const loadMmdbMeta = async () => {
            setMmdbMetaLoading(true);
            try {
                const res = await fetch('/api/dashboard/admin/mmdb/meta', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                setMmdbFiles(Array.isArray(data?.files) ? data.files : []);
            } catch {
                setMmdbFiles([]);
            } finally {
                setMmdbMetaLoading(false);
            }
        };

        fetch('/api/dashboard/admin/settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setSettings(data);
                setLoading(false);
                loadMmdbMeta();
            })
            .catch(() => {
                toast.error('加载设置失败');
                setLoading(false);
            });
    }, [token]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const { mmdbCountryUrl, mmdbAsnUrl, ...settingsToSave } = settings;
            const res = await fetch('/api/dashboard/admin/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(settingsToSave)
            });
            if (res.ok) {
                toast.success('设置已保存');
            } else {
                toast.error('保存失败');
            }
        } catch (e) {
            toast.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const formatTimestamp = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return '-';
        return new Date(n).toLocaleString();
    };

    const handleUpdateMmdb = async () => {
        setMmdbUpdating(true);
        try {
            const res = await fetch('/api/dashboard/admin/mmdb/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    countryUrl: settings.mmdbCountryUrl || '',
                    asnUrl: settings.mmdbAsnUrl || '',
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data?.error || 'MMDB 更新失败');
                return;
            }
            setMmdbFiles(Array.isArray(data?.files) ? data.files : []);
            setSettings(prev => ({
                ...prev,
                mmdbCountryUrl: settings.mmdbCountryUrl || prev.mmdbCountryUrl || '',
                mmdbAsnUrl: settings.mmdbAsnUrl || prev.mmdbAsnUrl || '',
            }));
            toast.success('MMDB 更新成功');
        } catch {
            toast.error('MMDB 更新失败');
        } finally {
            setMmdbUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-gray-400">加载中...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* 导航栏 */}
            <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
                <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/')}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-white">系统设置</span>
                    </div>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="space-y-6">
                        {/* Frontend URL */}
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">
                                Sub-Store 前端 URL
                            </label>
                            <input
                                type="text"
                                value={settings.frontendUrl || ''}
                                onChange={e => updateSetting('frontendUrl', e.target.value)}
                                placeholder="https://sub-store.vercel.app/"
                                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                            />
                            <p className="text-gray-500 text-xs mt-2">
                                用户登录后跳转的前端地址
                            </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Token Expiry */}
                            <div>
                                <label className="block text-white text-sm font-medium mb-2">
                                    登录有效期（小时）
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="8760"
                                    value={settings.tokenExpiryHours || 168}
                                    onChange={e => updateSetting('tokenExpiryHours', parseInt(e.target.value) || 168)}
                                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                />
                                <p className="text-gray-500 text-xs mt-2">
                                    用户登录后 Token 的有效时长，默认 168 小时（7 天）
                                </p>
                            </div>

                            {/* Password Min Length */}
                            <div>
                                <label className="block text-white text-sm font-medium mb-2">
                                    密码最小长度
                                </label>
                                <input
                                    type="number"
                                    min="4"
                                    max="64"
                                    value={settings.passwordMinLength ?? 8}
                                    onChange={e => updateSetting('passwordMinLength', parseInt(e.target.value, 10) || 8)}
                                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                />
                                <p className="text-gray-500 text-xs mt-2">
                                    用户密码长度下限
                                </p>
                            </div>
                        </div>

                        {/* Cron Batch Settings */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-white text-sm font-medium mb-2">
                                    定时任务批处理数量
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={settings.cronBatchSize ?? 50}
                                    onChange={e => updateSetting('cronBatchSize', parseInt(e.target.value, 10) || 50)}
                                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                />
                                <p className="text-gray-500 text-xs mt-2">
                                    每批处理的用户数，数值越大越耗时
                                </p>
                            </div>
                            <div>
                                <label className="block text-white text-sm font-medium mb-2">
                                    定时任务最大用户数
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100000"
                                    value={settings.cronMaxUsers ?? 200}
                                    onChange={e => updateSetting('cronMaxUsers', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                />
                                <p className="text-gray-500 text-xs mt-2">
                                    单次最多处理用户数，0 表示不限制
                                </p>
                            </div>
                            <div>
                                <label className="block text-white text-sm font-medium mb-2">
                                    定时任务时间预算（毫秒）
                                </label>
                                <input
                                    type="number"
                                    min="1000"
                                    max="60000"
                                    value={settings.cronTimeBudgetMs ?? 20000}
                                    onChange={e => updateSetting('cronTimeBudgetMs', parseInt(e.target.value, 10) || 20000)}
                                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                />
                                <p className="text-gray-500 text-xs mt-2">
                                    单次定时任务的最大执行时间
                                </p>
                            </div>
                        </div>

                        {/* Show User Path */}
                        <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl">
                            <div>
                                <p className="text-white text-sm font-medium">显示用户路径</p>
                                <p className="text-gray-500 text-xs mt-1">在用户列表中显示用户的访问路径</p>
                            </div>
                            <button
                                onClick={() => updateSetting('showUserPath', !settings.showUserPath)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showUserPath !== false ? 'bg-gradient-to-r from-cyan-500 to-purple-600' : 'bg-slate-600'
                                    }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.showUserPath !== false ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Captcha Type */}
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">
                                验证码类型
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => updateSetting('captchaType', 'builtin')}
                                    className={`flex-1 py-3 rounded-xl transition-colors text-sm ${(settings.captchaType || 'builtin') === 'builtin'
                                        ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
                                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                                        }`}
                                >
                                    内置验证码
                                </button>
                                <button
                                    onClick={() => updateSetting('captchaType', 'turnstile')}
                                    className={`flex-1 py-3 rounded-xl transition-colors text-sm ${settings.captchaType === 'turnstile'
                                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
                                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                                        }`}
                                >
                                    Cloudflare Turnstile
                                </button>
                            </div>
                        </div>

                        {/* Turnstile Config */}
                        {settings.captchaType === 'turnstile' && (
                            <div className="space-y-4 p-4 bg-slate-700/30 rounded-xl">
                                <div>
                                    <label className="block text-white text-sm font-medium mb-2">
                                        Site Key
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.turnstileSiteKey || ''}
                                        onChange={e => updateSetting('turnstileSiteKey', e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-mono text-sm"
                                        placeholder="0x..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-white text-sm font-medium mb-2">
                                        Secret Key
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.turnstileSecretKey || ''}
                                        onChange={e => updateSetting('turnstileSecretKey', e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-mono text-sm"
                                        placeholder="0x..."
                                    />
                                </div>
                                <p className="text-gray-500 text-xs">
                                    在 <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener" className="text-orange-400 hover:underline">Cloudflare Dashboard</a> 创建 Turnstile 站点获取密钥
                                </p>
                            </div>
                        )}

                        {/* 保存按钮 */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {saving ? '保存中...' : '保存设置'}
                        </button>
                    </div>
                </div>

                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="space-y-6">
                        <div className="rounded-xl bg-slate-700/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <p className="text-white font-medium">MMDB 校验工具</p>
                                <p className="text-gray-400 text-xs mt-1">
                                    在浏览器本地验证 Country.mmdb 与 Country-asn.mmdb 是否满足当前项目字段要求
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/mmdb-validator')}
                                className="px-4 py-2 rounded-lg bg-slate-600/70 text-gray-100 hover:bg-slate-600 transition-colors"
                            >
                                打开工具
                            </button>
                        </div>

                        <div className="rounded-xl bg-slate-700/30 p-4 space-y-4">
                            <div>
                                <p className="text-white font-medium">MMDB 在线更新</p>
                                <p className="text-gray-400 text-xs mt-1">
                                    配置下载地址后可手动更新 IndexDO 中的 MMDB 缓存，更新后会记录每个库的构建时间
                                </p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="block text-white text-sm font-medium mb-2">Country.mmdb URL</label>
                                    <input
                                        type="text"
                                        value={settings.mmdbCountryUrl || ''}
                                        onChange={e => updateSetting('mmdbCountryUrl', e.target.value)}
                                        placeholder="https://example.com/Country.mmdb"
                                        className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-white text-sm font-medium mb-2">Country-asn.mmdb URL</label>
                                    <input
                                        type="text"
                                        value={settings.mmdbAsnUrl || ''}
                                        onChange={e => updateSetting('mmdbAsnUrl', e.target.value)}
                                        placeholder="https://example.com/Country-asn.mmdb"
                                        className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-500/50"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleUpdateMmdb}
                                disabled={mmdbUpdating}
                                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-600/70 text-gray-100 hover:bg-slate-600 transition-colors disabled:opacity-50"
                            >
                                {mmdbUpdating ? '更新中...' : '立即更新 MMDB'}
                            </button>

                            <div className="overflow-auto rounded-xl border border-slate-700/60">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-400 border-b border-slate-700 bg-slate-900/60">
                                            <th className="py-2 px-3">文件</th>
                                            <th className="py-2 px-3">来源 URL</th>
                                            <th className="py-2 px-3">构建时间</th>
                                            <th className="py-2 px-3">更新时间</th>
                                            <th className="py-2 px-3">大小</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mmdbMetaLoading && (
                                            <tr>
                                                <td className="py-3 px-3 text-gray-400" colSpan={5}>加载中...</td>
                                            </tr>
                                        )}
                                        {!mmdbMetaLoading && mmdbFiles.length === 0 && (
                                            <tr>
                                                <td className="py-3 px-3 text-gray-400" colSpan={5}>暂无 MMDB 缓存记录</td>
                                            </tr>
                                        )}
                                        {!mmdbMetaLoading && mmdbFiles.map((file) => (
                                            <tr key={file.name} className="border-b border-slate-800/70 align-top">
                                                <td className="py-2 px-3 text-gray-200">{file.name}</td>
                                                <td className="py-2 px-3 text-gray-300 break-all">{file.sourceUrl || '-'}</td>
                                                <td className="py-2 px-3 text-gray-300">{formatTimestamp(file.buildEpoch)}</td>
                                                <td className="py-2 px-3 text-gray-300">{formatTimestamp(file.updatedAt)}</td>
                                                <td className="py-2 px-3 text-gray-300">{Number.isFinite(Number(file.size)) ? `${(Number(file.size) / 1024 / 1024).toFixed(2)} MB` : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default SystemSettings;
