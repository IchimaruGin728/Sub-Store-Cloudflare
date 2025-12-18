import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonate } from '../contexts/ImpersonateContext';
import { useToast } from './Toast';
import ChangePasswordModal from './ChangePasswordModal';
import EditUserModal from './EditUserModal';
import ChangeUsernameModal from './ChangeUsernameModal';
import Footer from './Footer';
import SystemSettings from './SystemSettings';

const AdminDashboard = () => {
    const { token, frontendUrl, logout } = useAuth();
    const { switchToOwnPanel, impersonate } = useImpersonate();
    const toast = useToast();

    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [creating, setCreating] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [resettingUser, setResettingUser] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState('');
    const [showPwdModal, setShowPwdModal] = useState(false);
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [currentUsername, setCurrentUsername] = useState('');
    const [createExpanded, setCreateExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const refresh = () => fetch('/api/dashboard/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(setUsers);

    useEffect(() => {
        refresh();
        // 获取管理员信息
        fetch('/api/dashboard/user/me', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(d => {
                setCurrentUsername(d?.username || '');
                setAvatarUrl(d?.avatarUrl || '');
            });
    }, [token]);

    const handleCreate = async () => {
        if (!newUser || !newPwd) {
            toast.warning('请填写用户名和密码');
            return;
        }
        setCreating(true);
        try {
            const res = await fetch('/api/dashboard/admin/user/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ username: newUser, password: newPwd, role: 'user' })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`用户 ${newUser} 创建成功！`);
                setNewUser('');
                setNewPwd('');
                refresh();
            } else {
                toast.error(data.error || '创建失败');
            }
        } catch (e) {
            toast.error('创建失败');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id, role, username) => {
        if (role === 'admin') {
            toast.error('无法删除管理员账户');
            return;
        }
        if (!confirm(`确定要删除用户 "${username}" 吗？\n\n⚠️ 该用户的所有数据将被永久删除！`)) return;

        await fetch(`/api/dashboard/admin/user/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        refresh();
    };

    const handleEdit = async (id) => {
        const res = await fetch(`/api/dashboard/admin/user/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await res.json();
        setEditingUser({ id, username: d.username, path: d.path, notes: d.notes || '', dataStr: d.data || '{}' });
    };

    const handlePwdModalClose = (success) => {
        setResettingUser(null);
        if (success) toast.success('密码已重置！');
    };

    const baseUrl = window.location.origin;
    const getOpenFrontendUrl = (userPath) => `${frontendUrl}?api=${encodeURIComponent(`${baseUrl}/${userPath}`)}`;

    // 显示系统设置页面
    if (showSettings) {
        return <SystemSettings onBack={() => setShowSettings(false)} />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* 导航栏 */}
            <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
                <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-white">管理控制台</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={switchToOwnPanel}
                            className="text-gray-400 hover:text-cyan-400 text-sm transition-colors"
                        >
                            我的设置
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl transition-colors"
                            >
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                        <span className="text-white text-xs font-medium">
                                            {currentUsername ? currentUsername[0].toUpperCase() : 'A'}
                                        </span>
                                    </div>
                                )}
                                <span className="text-gray-300 text-sm hidden sm:inline">{currentUsername || 'Admin'}</span>
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
                                            <p className="text-amber-400 text-xs">管理员</p>
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
                    </div>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
                {/* 操作卡片行 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 创建用户卡片 - 可折叠 */}
                    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <button
                            onClick={() => setCreateExpanded(!createExpanded)}
                            className="w-full p-6 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-white font-medium">创建用户</h3>
                                    <p className="text-gray-500 text-sm">添加新的 Sub-Store 用户</p>
                                </div>
                            </div>
                            <svg className={`w-5 h-5 text-gray-400 transition-transform ${createExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {createExpanded && (
                            <div className="px-6 pb-6 pt-2 border-t border-slate-700/30">
                                <div className="space-y-4">
                                    <input
                                        placeholder="用户名"
                                        className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        value={newUser}
                                        onChange={e => setNewUser(e.target.value)}
                                    />
                                    <input
                                        placeholder="密码"
                                        type="password"
                                        className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        value={newPwd}
                                        onChange={e => setNewPwd(e.target.value)}
                                    />
                                    <button
                                        onClick={handleCreate}
                                        disabled={creating}
                                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                                    >
                                        {creating ? '创建中...' : '添加用户'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 系统设置卡片 */}
                    <button
                        onClick={() => setShowSettings(true)}
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between w-full text-left hover:bg-white/10 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-medium">系统设置</h3>
                                <p className="text-gray-500 text-sm">管理全局配置选项</p>
                            </div>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* 用户列表 */}
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        用户列表
                        <span className="ml-2 px-2 py-0.5 bg-slate-700 rounded-full text-xs text-gray-400">{users.length}</span>
                    </h2>

                    <div className="space-y-3">
                        {users.map(u => (
                            <div key={u.id} className="bg-slate-800/50 rounded-xl p-4">
                                <div className="flex items-center gap-4 mb-3">
                                    {u.avatarUrl ? (
                                        <img src={u.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                                    ) : (
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${u.role === 'admin' ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-slate-600 to-slate-700'}`}>
                                            <span className="text-white font-medium text-sm">{u.username[0].toUpperCase()}</span>
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-white font-medium">{u.username}</span>
                                            {u.role === 'admin' && (
                                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">管理员</span>
                                            )}
                                            {u.notes && (
                                                <span className="px-2 py-0.5 bg-slate-700/50 text-gray-400 rounded text-xs">{u.notes}</span>
                                            )}
                                        </div>
                                        <code className="text-gray-500 text-xs font-mono truncate block">{u.path}</code>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {u.role !== 'admin' && (
                                        <button
                                            onClick={() => impersonate(u.username, u.path)}
                                            className="px-3 py-1.5 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-xs transition-colors"
                                        >
                                            切换
                                        </button>
                                    )}
                                    <a
                                        href={getOpenFrontendUrl(u.path)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded-lg text-xs transition-colors"
                                    >
                                        打开
                                    </a>
                                    <button
                                        onClick={() => handleEdit(u.id)}
                                        className="px-3 py-1.5 bg-slate-700 text-gray-300 hover:bg-slate-600 rounded-lg text-xs transition-colors"
                                    >
                                        编辑
                                    </button>
                                    <button
                                        onClick={() => setResettingUser(u.id)}
                                        className="px-3 py-1.5 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg text-xs transition-colors"
                                    >
                                        密码
                                    </button>
                                    {u.role !== 'admin' && (
                                        <button
                                            onClick={() => handleDelete(u.id, u.role, u.username)}
                                            className="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs transition-colors"
                                        >
                                            删除
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {users.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                暂无用户
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {editingUser && (
                <EditUserModal
                    user={editingUser}
                    token={token}
                    baseUrl={baseUrl}
                    onClose={() => setEditingUser(null)}
                    onSuccess={() => { setEditingUser(null); refresh(); }}
                />
            )}

            {resettingUser && (
                <ChangePasswordModal
                    userId={resettingUser}
                    token={token}
                    isAdmin={true}
                    onClose={handlePwdModalClose}
                />
            )}

            {showPwdModal && (
                <ChangePasswordModal
                    token={token}
                    isAdmin={false}
                    onClose={(success) => {
                        setShowPwdModal(false);
                        if (success) toast.success('密码修改成功！');
                    }}
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

export default AdminDashboard;
