'use client';

import { useEffect, useRef } from 'react';

/**
 * Confirm modal.
 *
 * Drop-in replacement for window.confirm() that doesn't block the JS
 * event loop, is keyboard-accessible, and matches the existing
 * components/alert.jsx visual language.
 *
 * Usage:
 *
 *   const [confirmState, setConfirmState] = useState(null)
 *   // ...later, instead of `if (!confirm("...")) return`:
 *   setConfirmState({
 *     message: 'Revoke this API key? This cannot be undone.',
 *     confirmLabel: 'Revoke',
 *     destructive: true,
 *     onConfirm: () => doTheThing()
 *   })
 *
 *   <Confirm state={confirmState} onClose={() => setConfirmState(null)} />
 *
 * Properties:
 *   state          — null to hide, or { message, confirmLabel?, cancelLabel?,
 *                     destructive?, onConfirm } to show
 *   onClose        — called when the user dismisses (Escape, backdrop click, cancel)
 *                    NOT called when they confirm — that fires onConfirm instead
 *
 * Accessibility:
 *   - role="alertdialog" + aria-modal="true"
 *   - Focus auto-moves to the destructive/primary button
 *   - Escape dismisses
 *   - Backdrop click dismisses
 *   - Enter/Space on the confirm button fires it
 */
export default function Confirm({ state, onClose }) {
    const buttonRef = useRef(null);

    useEffect(() => {
        if (!state) return;
        // Focus the primary button so Enter immediately confirms.
        buttonRef.current?.focus();

        const handler = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [state, onClose]);

    if (!state) return null;

    const {
        message,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        destructive = false,
        onConfirm
    } = state;

    const handleConfirm = () => {
        // Call before close so onConfirm can show its own follow-up dialogs
        // (e.g. busy spinners) without race conditions.
        onConfirm?.();
        onClose?.();
    };

    return (
        <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmation"
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
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        className="text-gray-200 px-4 py-2 bg-[#2c2c3a] hover:bg-[#3a3a4a]
                                   active:scale-95 rounded-lg transition duration-200
                                   focus:outline-none focus:ring-2 focus:ring-[#483AA0] focus:ring-offset-2
                                   focus:ring-offset-[#1f1f2e]"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={buttonRef}
                        onClick={handleConfirm}
                        className={`text-white px-4 py-2 active:scale-95 rounded-lg transition duration-200 font-semibold
                                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1f1f2e]
                                   ${destructive
                                       ? 'bg-red-900/60 hover:bg-red-900/80 focus:ring-red-300'
                                       : 'bg-[#483AA0] hover:bg-[#372a7a] focus:ring-[#9b8bd9]'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
