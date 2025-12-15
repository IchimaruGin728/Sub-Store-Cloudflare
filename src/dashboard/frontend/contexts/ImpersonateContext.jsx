import { createContext, useContext, useState } from 'react';

const ImpersonateContext = createContext(null);

export const useImpersonate = () => {
    const context = useContext(ImpersonateContext);
    if (!context) {
        throw new Error('useImpersonate must be used within ImpersonateProvider');
    }
    return context;
};

export const ImpersonateProvider = ({ children }) => {
    // 管理员查看自己的用户面板
    const [viewingOwnPanel, setViewingOwnPanel] = useState(false);
    // 管理员模拟其他用户
    const [impersonatedUser, setImpersonatedUser] = useState(null); // { username, path }

    const isImpersonating = viewingOwnPanel || impersonatedUser !== null;

    // 切换到自己的用户面板
    const switchToOwnPanel = () => {
        setViewingOwnPanel(true);
        setImpersonatedUser(null);
    };

    // 模拟指定用户
    const impersonate = (username, path) => {
        setImpersonatedUser({ username, path });
        setViewingOwnPanel(false);
    };

    // 返回管理控制台
    const returnToAdmin = () => {
        setViewingOwnPanel(false);
        setImpersonatedUser(null);
    };

    // 获取当前有效路径
    const getEffectivePath = (originalPath) => {
        if (impersonatedUser) return impersonatedUser.path;
        return originalPath;
    };

    const value = {
        isImpersonating,
        viewingOwnPanel,
        impersonatedUser,
        impersonatedUsername: impersonatedUser?.username || null,
        switchToOwnPanel,
        impersonate,
        returnToAdmin,
        getEffectivePath,
    };

    return (
        <ImpersonateContext.Provider value={value}>
            {children}
        </ImpersonateContext.Provider>
    );
};

export default ImpersonateContext;
