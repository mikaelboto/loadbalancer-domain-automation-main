export function response(statusCode, body){
    return {
        statusCode: statusCode,
        body: JSON.stringify(body)
    }
}