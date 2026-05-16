import { ZodError } from 'zod'

export function validate(schema, data) {
    try {
        return {
            success: true,
            data: schema.parse(data)
        }
    } catch (err) {
        if (err instanceof ZodError) {
            return {
                success: false,
                errors: err.errors
            }
        }
    } 
    return {
        success: false,
        errors: ['Validation failed.']
    }

}