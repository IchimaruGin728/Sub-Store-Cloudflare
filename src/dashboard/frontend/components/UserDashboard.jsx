import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonate } from '../contexts/ImpersonateContext';
import { useToast } from './Toast';
import SettingsPanel from './SettingsPanel';
import ChangePasswordModal from './ChangePasswordModal';
import ChangeUsernameModal from './ChangeUsernameModal';
import Footer from './Footer';

const UserDashboard = () => {
    const { token, userPath, frontendUrl, logout, updatePath, isAdmin } = useAuth();
    const { isImpersonating, impersonatedUser, impersonatedUsername, returnToAdmin } = useImpersonate();
    const toast = useToast();

    const [data, setData] = useState(null);
    const [showPwdModal, setShowPwdModal] = useState(false);
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [copied, setCopied] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [currentUsername, setCurrentUsername] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState('');

    // 获取有效路径（模拟用户时使用模拟用户的路径）
    const effectivePath = impersonatedUser ? impersonatedUser.path : userPath;

    useEffect(() => {
        fetch('/api/dashboard/user/me', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(d => {
                setData(d);
                setCurrentUsername(d?.username || '');
                setAvatarUrl(d?.avatarUrl || '');
            });
    }, [token]);

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePwdModalClose = (success) => {
        setShowPwdModal(false);
        if (success) toast.success('密码修改成功！');
    };

    const baseUrl = window.location.origin;
    const backendApiUrl = effectivePath ? `${baseUrl}/${effectivePath}` : baseUrl;
    const openFrontendUrl = `${frontendUrl}?api=${encodeURIComponent(backendApiUrl)}`;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* 模拟用户提示条 */}
            {isImpersonating && (
                <div className="bg-purple-600/90 text-white text-center py-2 text-sm">
                    {impersonatedUsername ? (
                        <>正在查看用户 <strong>{impersonatedUsername}</strong> 的面板</>
                    ) : (
                        <>正在查看我的用户面板</>
                    )}
                    <button
                        onClick={returnToAdmin}
                        className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs transition-colors"
                    >
                        返回管理控制台
                    </button>
                </div>
            )}

            {/* 导航栏 */}
            <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
                <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-white">
                            {impersonatedUsername ? `${impersonatedUsername} 的订阅` : '我的订阅'}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        {isImpersonating ? (
                            <button
                                onClick={returnToAdmin}
                                className="text-purple-400 hover:text-purple-300 text-sm transition-colors"
                            >
                                返回控制台
                            </button>
                        ) : (
                            <div className="relative">
                                <button
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl transition-colors"
                                >
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
                                            <span className="text-white text-xs font-medium">
                                                {currentUsername ? currentUsername[0].toUpperCase() : 'U'}
                                            </span>
                                        </div>
                                    )}
                                    <span className="text-gray-300 text-sm hidden sm:inline">{currentUsername || '用户'}</span>
                                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {dropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                                        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                                            <div className="px-4 py-3 border-b border-slate-700">
                                                <p className="text-white font-medium text-sm">{currentUsername}</p>
                                                <p className="text-gray-500 text-xs truncate">{data?.role === 'admin' ? '管理员' : '普通用户'}</p>
                                            </div>
                                            <button
                                                onClick={() => { setDropdownOpen(false); setShowUsernameModal(true); }}
                                                className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-slate-700/50 flex items-center gap-3 transition-colors"
                                            >
                                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                                修改用户名
                                            </button>
                                            <button
                                                onClick={() => { setDropdownOpen(false); setShowPwdModal(true); }}
                                                className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-slate-700/50 flex items-center gap-3 transition-colors"
                                            >
                                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                </svg>
                                                修改密码
                                            </button>
                                            <div className="border-t border-slate-700 mt-1 pt-1">
                                                <button
                                                    onClick={() => { setDropdownOpen(false); logout(); }}
                                                    className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                    </svg>
                                                    退出登录
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* API 地址卡片 */}
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            API 地址
                        </h2>
                    </div>

                    <div className="relative">
                        <code className="block p-4 bg-slate-800/50 rounded-xl text-cyan-300 text-sm break-all font-mono pr-24">
                            {backendApiUrl}
                        </code>
                        <button
                            onClick={() => copyToClipboard(backendApiUrl)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-lg text-xs transition-colors"
                        >
                            {copied ? '已复制' : '复制'}
                        </button>
                    </div>

                    <p className="text-gray-500 text-xs mt-3">
                        💡 此地址用于配置 Sub-Store 前端或代理客户端
                    </p>
                </div>

                {/* 打开前端按钮 */}
                <a
                    href={openFrontendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full backdrop-blur-xl bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border border-cyan-500/30 rounded-2xl p-6 hover:from-cyan-500/30 hover:to-purple-600/30 transition-all group"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">打开 Sub-Store 前端</h3>
                                <p className="text-gray-400 text-sm">管理订阅、转换规则、编辑配置</p>
                            </div>
                        </div>
                        <svg className="w-6 h-6 text-gray-400 group-hover:text-white group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </a>

                {/* 设置面板 */}
                <div className="mt-6">
                    <SettingsPanel
                        token={token}
                        expanded={settingsExpanded}
                        onToggle={() => setSettingsExpanded(!settingsExpanded)}
                        userPath={effectivePath}
                        onPathChange={updatePath}
                    />
                </div>

                {/* 信息提示 */}
                <div className="mt-8 backdrop-blur-xl bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                    <div className="flex gap-3">
                        <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-sm text-amber-200/80">
                            <p className="font-medium mb-1">使用说明</p>
                            <ul className="text-amber-200/60 space-y-1">
                                <li>• 点击上方按钮进入 Sub-Store 管理界面</li>
                                <li>• API 地址已自动配置，无需手动填写</li>
                                <li>• 如需更换路径，点击「重新生成」按钮</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </main>

            {showPwdModal && (
                <ChangePasswordModal
                    token={token}
                    isAdmin={false}
                    onClose={handlePwdModalClose}
                />
            )}

            {showUsernameModal && (
                <ChangeUsernameModal
                    token={token}
                    currentUsername={currentUsername}
                    onClose={() => setShowUsernameModal(false)}
                    onSuccess={(newName) => {
                        setCurrentUsername(newName);
                        setShowUsernameModal(false);
                        toast.success('用户名修改成功！');
                    }}
                />
            )}

            <Footer />
        </div>
    );
};

export default UserDashboard;
