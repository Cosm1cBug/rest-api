import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const compat = new FlatCompat({
    baseDirectory: __dirname
})

// V5-5 #5 cosmetic ESLint fix — wrap the default-exported array in a
// named const so `import/no-anonymous-default-export` doesn't warn.
const eslintConfig = [
    ...compat.extends('next/core-web-vitals'),
    {
        // Don't lint generated / vendored output.
        ignores: [
            'node_modules/**',
            '.next/**',
            'out/**',
            'coverage/**',
            'public/**'
        ]
    }
]

export default eslintConfig
