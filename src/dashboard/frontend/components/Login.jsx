import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [captchaCode, setCaptchaCode] = useState('');
    const [captchaId, setCaptchaId] = useState('');
    const [captchaSvg, setCaptchaSvg] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // 加载验证码
    const loadCaptcha = async () => {
        try {
            const res = await fetch('/api/dashboard/captcha');
            const data = await res.json();
            setCaptchaId(data.id);
            setCaptchaSvg(data.svg);
            setCaptchaCode('');
        } catch (e) {
            console.error('加载验证码失败');
        }
    };

    // 组件挂载时加载验证码
    useEffect(() => {
        loadCaptcha();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!captchaCode) {
            setError('请输入验证码');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/dashboard/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, captchaId, captchaCode })
            });
            const data = await res.json();
            if (res.ok) {
                login(data.token, data.role, data.path, data.frontendUrl);
            } else {
                setError(data.error || '登录失败');
                loadCaptcha(); // 刷新验证码
            }
        } catch (err) {
            setError('网络错误，请重试');
            loadCaptcha();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 relative overflow-hidden">
            {/* 背景装饰 */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
                <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '4s' }}></div>
            </div>

            <div className="relative backdrop-blur-xl bg-white/10 p-8 rounded-3xl shadow-2xl border border-white/20 w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 mb-4 shadow-lg">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Sub-Store</h1>
                    <p className="text-gray-400 text-sm">订阅管理控制台</p>
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl mb-6 text-sm backdrop-blur-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">用户名</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
                            placeholder="请输入用户名"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">密码</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
                            placeholder="请输入密码"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">验证码</label>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={captchaCode}
                                onChange={e => setCaptchaCode(e.target.value.toUpperCase())}
                                maxLength={4}
                                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all uppercase tracking-widest"
                                placeholder="请输入验证码"
                            />
                            <div
                                className="flex-shrink-0 bg-white rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
                                style={{ width: '120px', height: '46px' }}
                                onClick={loadCaptcha}
                                title="点击刷新验证码"
                                dangerouslySetInnerHTML={{ __html: captchaSvg }}
                            />
                        </div>
                        <p className="text-gray-500 text-xs mt-2">点击图片可刷新验证码</p>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium rounded-xl shadow-lg hover:shadow-cyan-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? '登录中...' : '登 录'}
                    </button>
                </form>

                <p className="text-center text-gray-500 text-xs mt-6">
                    首次使用请使用 admin / admin 登录
                </p>
            </div>
        </div>
    );
};

export default Login;
