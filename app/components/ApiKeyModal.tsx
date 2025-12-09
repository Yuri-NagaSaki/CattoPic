'use client';

import { useState, useEffect } from 'react';
import { validateApiKey, getApiKey, removeApiKey, setApiKey } from '../utils/auth';
import { ApiKeyModalProps } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, LockClosedIcon, InfoCircledIcon, Spinner } from '../components/ui/icons';

export default function ApiKeyModal({ isOpen, onClose, onSuccess }: ApiKeyModalProps) {
    const [apiKey, setApiKey] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [currentKeyDomain, setCurrentKeyDomain] = useState<string | null>(null);
    const [mode, setMode] = useState<'new' | 'manage'>('new');

    // 检查是否已经有API Key
    useEffect(() => {
        if (isOpen) {
            const existingKey = getApiKey();
            if (existingKey) {
                setMode('manage');
            } else {
                setCurrentKeyDomain(null);
                setMode('new');
            }

            // 重置状态
            setApiKey('');
            setError('');
            setShowSuccess(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim()) {
            setError('请输入API Key');
            return;
        }

        setIsValidating(true);
        setError('');

        try {
            const isValid = await validateApiKey(apiKey);
            if (isValid) {
                // 显示成功动画
                setShowSuccess(true);

                // 保存API Key到本地存储
                setApiKey(apiKey);

                // 等待动画完成后关闭弹窗
                setTimeout(() => {
                    setShowSuccess(false);
                    onSuccess(apiKey);
                    onClose();
                }, 1200);
            } else {
                setError('API Key无效，请重试');
            }
        } catch (err) {
            setError('验证失败，请重试');
        } finally {
            setIsValidating(false);
        }
    };

    const handleClearKey = () => {
        removeApiKey();
        setMode('new');
        setCurrentKeyDomain(null);
    };

    const handleConfirmClear = () => {
        handleClearKey();
        onClose();
    };

    const handleCancel = () => {
        onClose();
    };

    if (!isOpen) return null;

    // 如果已经有API Key，显示管理界面
    if (mode === 'manage') {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
                    >
                        <div className="flex items-center mb-6">
                            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full mr-4 relative">
                                <CheckIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">API 密钥管理</h2>
                        </div>

                        <div className="mb-6">
                            <p className="text-gray-600 dark:text-gray-300 mb-4">
                                您想要管理您的 API 密钥吗？
                            </p>
                            <div className="bg-gray-50 dark:bg-slate-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                                <div className="flex items-center">
                                    <span className="bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-1 rounded-full text-sm">
                                        已验证密钥
                                    </span>
                                </div>
                            </div>
                        </div>

                        <ul className="mb-6 space-y-2 text-sm">
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span className="text-gray-600 dark:text-gray-300">确定: 清除当前 API 密钥并输入新的密钥</span>
                            </li>
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span className="text-gray-600 dark:text-gray-300">取消: 保持当前设置</span>
                            </li>
                        </ul>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                取消
                            </button>
                            <motion.button
                                onClick={handleConfirmClear}
                                className="px-4 py-2.5 bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 shadow-md transition-all"
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                            >
                                确定
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        );
    }

    // 输入新API Key的界面
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl overflow-hidden relative"
                    >
                        <div className="flex items-center mb-6">
                            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-full mr-4 relative">
                                {!showSuccess && (
                                    <LockClosedIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                                )}

                                {showSuccess && (
                                    <motion.div
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{
                                            scale: [0.5, 1.2, 1],
                                            opacity: 1,
                                            rotate: [0, 10, -10, 0]
                                        }}
                                        transition={{
                                            duration: 0.5,
                                            times: [0, 0.6, 0.9, 1],
                                            ease: "easeInOut"
                                        }}
                                        className="absolute inset-0 flex items-center justify-center"
                                    >
                                        <CheckIcon className="h-6 w-6 text-green-500" />
                                    </motion.div>
                                )}
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">API 密钥验证</h2>
                        </div>

                        <p className="text-gray-600 dark:text-gray-300 mb-6">
                            请输入您的 API 密钥以使用 CattoPic 服务
                        </p>

                        <form onSubmit={handleSubmit}>
                            <div className="relative mb-6">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                    <LockClosedIcon className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-slate-700 dark:text-white text-sm transition-all duration-200"
                                    placeholder="输入您的API密钥"
                                    autoFocus
                                />
                            </div>

                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm"
                                    >
                                        <div className="flex">
                                            <InfoCircledIcon className="h-5 w-5 mr-2 shrink-0" />
                                            {error}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    取消
                                </button>
                                <motion.button
                                    type="submit"
                                    disabled={isValidating || showSuccess}
                                    className="px-4 py-2.5 bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 shadow-md disabled:opacity-70 transition-all"
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                >
                                    {isValidating ? (
                                        <div className="flex items-center">
                                            <Spinner className="-ml-1 mr-2 h-4 w-4 text-white" />
                                            验证中
                                        </div>
                                    ) : showSuccess ? (
                                        <div className="flex items-center">
                                            <CheckIcon className="mr-2 h-4 w-4 text-white" />
                                            验证成功
                                        </div>
                                    ) : '验证'}
                                </motion.button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
