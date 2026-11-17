export type HttpError = Error & { status: number };

export function createHttpError(status: number, message: string): HttpError {
  return Object.assign(new Error(message), { status });
}
