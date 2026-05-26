'use client';

import { useEffect } from 'react';

export default function Alert({ message, visible, onClose }) {
    useEffect(() => {
        if (!visible) return;
        const handler = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [visible, onClose]);

    if (!visible) return null;

    return (
        <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Notification"
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-[#1f1f2e] text-gray-100 rounded-xl shadow-2xl border border-[#2c2c3a]
                           w-full max-w-sm mx-4 p-6 flex flex-col items-stretch"
            >
                <p className="mb-5 text-center text-base leading-relaxed">
                    {message}
                </p>
                <button
                    autoFocus
                    onClick={onClose}
                    className="text-white px-4 py-2 bg-[#483AA0] hover:bg-[#372a7a]
                               active:scale-95 rounded-lg transition duration-200 font-semibold
                               focus:outline-none focus:ring-2 focus:ring-[#9b8bd9] focus:ring-offset-2
                               focus:ring-offset-[#1f1f2e]"
                >
                    OK
                </button>
            </div>
        </div>
    );
}
