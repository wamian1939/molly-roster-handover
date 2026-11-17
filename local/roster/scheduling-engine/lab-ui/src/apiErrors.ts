type ApiErrorDetail = {
  code?:unknown
  message?:unknown
  msg?:unknown
  loc?:unknown
}

function describeDetail(value:unknown):string|null {
  if (typeof value==='string') return value
  if (!value || typeof value!=='object') return null
  const detail=value as ApiErrorDetail
  const message=typeof detail.message==='string' ? detail.message
    : typeof detail.msg==='string' ? detail.msg : null
  if (!message) return null
  const code=typeof detail.code==='string' ? `${detail.code}: ` : ''
  const location=Array.isArray(detail.loc) ? `${detail.loc.join('.')}: ` : ''
  return `${code}${location}${message}`
}

export function apiErrorMessage(body:unknown,status:number):string {
  if (body && typeof body==='object') {
    const response=body as {detail?:unknown;message?:unknown}
    const detail=response.detail??response.message
    if (Array.isArray(detail)) {
      const parts=detail.map(describeDetail).filter((item):item is string=>Boolean(item))
      if (parts.length) return [...new Set(parts)].join('; ')
    }
    const single=describeDetail(detail)
    if (single) return single
  }
  return `HTTP ${status}`
}
