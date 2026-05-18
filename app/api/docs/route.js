const adminKey = req.headers.get('x-admin-key')

if(adminKey !== provess.env.ADMIN_KEY) {
    return failure('Unauthorized.')
}