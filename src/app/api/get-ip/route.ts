import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
    const headersList = await headers();
    // 在本地開發時，IP 可能是 '::1' (IPv6 localhost) 或 '127.0.0.1'
    // 在 Vercel 等部署環境，'x-forwarded-for' 通常包含真實 IP
    const forwardedFor = headersList.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

    return NextResponse.json({ ip });
}
