import { AwsClient } from 'aws4fetch'
import { env } from '../../env'

// G3 — chamada ao AI Gateway. Em produção a Function URL exige SigV4
// (AuthType AWS_IAM, ADR-G4 do gateway): assinamos com as credenciais da role da
// Lambda (env padrão do runtime) via aws4fetch (zero deps, Web Crypto).
// Em dev (GATEWAY_AUTH vazio) é fetch puro contra o gateway local.

let aws: AwsClient | null = null

export function gatewayUrl(path: string): string {
  // Function URL termina com "/" — sem trim viraria "//v1/chat" (404)
  return env('GATEWAY_URL').replace(/\/+$/, '') + path
}

export async function gatewayFetch(path: string, init: RequestInit): Promise<Response> {
  const url = gatewayUrl(path)
  if (env('GATEWAY_AUTH') !== 'iam') return fetch(url, init)
  if (!aws) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('GATEWAY_AUTH=iam sem credenciais AWS no ambiente')
    }
    aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      service: 'lambda',
      region: process.env.AWS_REGION ?? 'sa-east-1',
    })
  }
  return aws.fetch(url, init)
}

/** Só p/ testes: zera o client cacheado (credenciais de teste mudam por caso). */
export function resetGatewayAuth(): void {
  aws = null
}
