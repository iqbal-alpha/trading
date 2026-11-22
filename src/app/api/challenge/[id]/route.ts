import { connection, NextResponse } from 'next/server';
import { fetchChallengeReportById } from '@/lib/challenge-report';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const { id } = await params;
  const result = await fetchChallengeReportById(id);

  if (result.status === 'invalid') {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (result.status === 'unconfigured') {
    return NextResponse.json(
      { ok: false, configured: false, error: result.error },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (result.status === 'not_found') {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (result.status === 'error') {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      configured: true,
      ...result.data,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
