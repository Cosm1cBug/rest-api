'use client';

export default function Alert({ message, visible, onClose }) {
    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 text-black dark:p-4 rounded-xl shadow-xl w-full max-w-sm flex flex-col items-center m-10">
                <p className="mb-4 text-white">{message}</p>
                <button
                    onClick={onClose}
                    className="text-white px-4 py-2 bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 rounded transition duration-300"
                >
                OK
                </button>
            </div>
        </div>
    );
}
