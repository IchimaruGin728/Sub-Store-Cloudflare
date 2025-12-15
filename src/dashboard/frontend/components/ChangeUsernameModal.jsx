import { useState } from 'react';
import { useToast } from './Toast';

const ChangeUsernameModal = ({ token, currentUsername, onClose, onSuccess }) => {
    const [username, setUsername] = useState(currentUsername || '');
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleSave = async () => {
        if (!username.trim()) {
            toast.warning('用户名不能为空');
            return;
        }
        if (username === currentUsername) {
            toast.info('用户名未修改');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/dashboard/user/username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ newUsername: username })
            });
            if (res.ok) {
                onSuccess(username);
            } else {
                const data = await res.json();
                toast.error(data.error || '修改失败');
            }
        } catch (e) {
            toast.error('修改失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-white">修改用户名</h2>
                    <button onClick={() => onClose(false)} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">新用户名</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            placeholder="输入新用户名"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={() => onClose(false)}
                        className="flex-1 py-3 bg-slate-700 text-gray-300 rounded-xl hover:bg-slate-600 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangeUsernameModal;
