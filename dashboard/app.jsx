import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ImpersonateProvider, useImpersonate } from './contexts/ImpersonateContext';
import { ToastProvider } from './components/Toast';

// 导入组件
import Login from './components/Login';
import UserDashboard from './components/UserDashboard';
import AdminDashboard from './components/AdminDashboard';

// ===== 路由组件 =====
const Routes = () => {
    const { isAuthenticated, isAdmin } = useAuth();
    const { isImpersonating } = useImpersonate();

    // 未登录
    if (!isAuthenticated) {
        return <Login />;
    }

    // 管理员模式：正在模拟用户或查看自己面板
    if (isAdmin && isImpersonating) {
        return <UserDashboard />;
    }

    // 管理员模式：管理控制台
    if (isAdmin) {
        return <AdminDashboard />;
    }

    // 普通用户模式
    return <UserDashboard />;
};

// ===== 应用根组件 =====
const App = () => {
    return (
        <ToastProvider>
            <AuthProvider>
                <ImpersonateProvider>
                    <Routes />
                </ImpersonateProvider>
            </AuthProvider>
        </ToastProvider>
    );
};

// ===== 初始化应用 =====
const root = createRoot(document.getElementById('app'));
root.render(<App />);
