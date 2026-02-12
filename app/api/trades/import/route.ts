import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { previewCSVImport, confirmCSVImport } from '@/lib/actions/trade.actions';

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const action = formData.get('action') as string; // 'preview' or 'confirm'
        const format = formData.get('format') as 'csv_robinhood' | 'csv_schwab' | 'csv_generic' | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const content = await file.text();

        if (action === 'preview' || !action) {
            const result = await previewCSVImport(userId, content, format || undefined);
            return NextResponse.json(result);
        }

        if (action === 'confirm') {
            const preview = await previewCSVImport(userId, content, format || undefined);
            const result = await confirmCSVImport(userId, preview.trades, preview.format);
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('[API /trades/import] error:', error);
        return NextResponse.json({ error: 'Failed to process import' }, { status: 500 });
    }
}
