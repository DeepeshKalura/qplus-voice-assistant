import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const roomName = searchParams.get('room') || 'test-room';
    const participantName = searchParams.get('username') || `user-${Math.floor(Math.random() * 1000)}`;

    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        return NextResponse.json(
            { error: 'Server misconfigured' },
            { status: 500 }
        );
    }

    const at = new AccessToken(
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET,
        {
            identity: participantName,
            ttl: '10m',
        }
    );

    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    return NextResponse.json({
        token: await at.toJwt(),
        url: process.env.LIVEKIT_WEBSOCKET_URL,
        roomName,
    });
}
