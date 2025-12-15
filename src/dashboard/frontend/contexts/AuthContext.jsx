import { createContext, useContext, useState } from 'react';

const FRONTEND_DEFAULT_URL = 'https://sub-store.vercel.app/';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem('ss_token'));
    const [role, setRole] = useState(() => localStorage.getItem('ss_role'));
    const [userPath, setUserPath] = useState(() => localStorage.getItem('ss_path'));
    const [frontendUrl, setFrontendUrl] = useState(() =>
        localStorage.getItem('ss_frontend_url') || FRONTEND_DEFAULT_URL
    );

    const isAuthenticated = !!token;
    const isAdmin = role === 'admin';

    const login = (newToken, newRole, path, feUrl) => {
        localStorage.setItem('ss_token', newToken);
        localStorage.setItem('ss_role', newRole);
        localStorage.setItem('ss_path', path || '');
        if (feUrl) {
            localStorage.setItem('ss_frontend_url', feUrl);
            setFrontendUrl(feUrl);
        }
        setToken(newToken);
        setRole(newRole);
        setUserPath(path || '');
    };

    const logout = () => {
        localStorage.removeItem('ss_token');
        localStorage.removeItem('ss_role');
        localStorage.removeItem('ss_path');
        setToken(null);
        setRole(null);
        setUserPath(null);
    };

    const updatePath = (newPath) => {
        localStorage.setItem('ss_path', newPath);
        setUserPath(newPath);
    };

    const value = {
        token,
        role,
        userPath,
        frontendUrl,
        isAuthenticated,
        isAdmin,
        login,
        logout,
        updatePath,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
