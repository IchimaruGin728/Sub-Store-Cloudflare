/**
 * Dashboard 路由配置
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useImpersonate } from './contexts/ImpersonateContext';

// 组件
import Login from './components/Login';
import UserDashboard from './components/UserDashboard';
import AdminDashboard from './components/AdminDashboard';
import SystemSettings from './components/SystemSettings';
import SettingsPanel from './components/SettingsPanel';
import MmdbValidator from './components/MmdbValidator';

// 受保护路由包装器
const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { isAuthenticated, isAdmin, validating } = useAuth();

    // 等待 token 验证完成
    if (validating) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-gray-400">验证中...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/dashboard/" replace />;
    }

    if (adminOnly && !isAdmin) {
        return <Navigate to="/dashboard/" replace />;
    }

    return children;
};

// 主页路由 - 根据登录状态和角色显示不同内容
const HomePage = () => {
    const { isAuthenticated, isAdmin } = useAuth();
    const { isImpersonating } = useImpersonate();

    if (!isAuthenticated) {
        return <Login />;
    }

    if (isAdmin && isImpersonating) {
        return <UserDashboard />;
    }

    if (isAdmin) {
        return <AdminDashboard />;
    }

    return <UserDashboard />;
};

// 路由配置
export const AppRouter = () => {
    return (
        <BrowserRouter basename="/dashboard">
            <Routes>
                {/* 主页 - 登录/仪表盘 */}
                <Route path="/" element={<HomePage />} />

                {/* 系统设置 - 仅管理员 */}
                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute adminOnly>
                            <SystemSettings />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/mmdb-validator"
                    element={
                        <ProtectedRoute adminOnly>
                            <MmdbValidator />
                        </ProtectedRoute>
                    }
                />

                {/* 用户设置 */}
                <Route
                    path="/user-settings"
                    element={
                        <ProtectedRoute>
                            <SettingsPanel />
                        </ProtectedRoute>
                    }
                />

                {/* 未匹配路由 - 重定向到主页 */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};
