import { useState } from 'react';

const ChangePasswordModal = ({ userId, token, isAdmin, onClose }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (newPassword !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }
        if (newPassword.length < 4) {
            setError('密码长度至少为4位');
            return;
        }

        setLoading(true);
        const url = isAdmin
            ? `/api/dashboard/admin/user/${userId}/password`
            : `/api/dashboard/user/password`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ newPassword })
            });
            if (res.ok) {
                onClose(true);
            } else {
                setError('修改失败，请重试');
            }
        } catch (e) {
            setError('网络错误');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold text-white mb-6">
                    {isAdmin ? '重置密码' : '修改密码'}
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">新密码</label>
                        <input
                            type="password"
                            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            placeholder="请输入新密码"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">确认密码</label>
                        <input
                            type="password"
                            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            placeholder="请再次输入新密码"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                        />
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={() => onClose(false)}
                        className="flex-1 py-3 bg-slate-700 text-gray-300 rounded-xl hover:bg-slate-600 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {loading ? '保存中...' : '确认修改'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
