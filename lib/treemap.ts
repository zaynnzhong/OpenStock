export interface TreemapItem {
    weight: number;
    [key: string]: unknown;
}

export interface TreemapRect extends TreemapItem {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

type ItemWithArea = TreemapItem & { area: number };

/**
 * Squarified treemap layout algorithm.
 * Takes items with numeric `weight` and a container size,
 * returns the same items augmented with x, y, w, h coordinates.
 */
export function squarify(
    items: TreemapItem[],
    containerW: number,
    containerH: number
): TreemapRect[] {
    if (items.length === 0) return [];

    const totalArea = containerW * containerH;
    const totalWeight = items.reduce((s, it) => s + it.weight, 0);
    if (totalWeight <= 0) {
        return items.map((it) => ({ ...it, x: 0, y: 0, w: 0, h: 0 }));
    }

    const sorted = items
        .map((it) => ({ ...it, area: (it.weight / totalWeight) * totalArea }))
        .sort((a, b) => b.area - a.area);

    const result: TreemapRect[] = [];
    layoutStrip(sorted, { x: 0, y: 0, w: containerW, h: containerH }, result);
    return result;
}

function worstRatio(row: number[], side: number): number {
    const s = row.reduce((a, b) => a + b, 0);
    if (s === 0) return Infinity;
    let worst = 0;
    for (const r of row) {
        const ratio = Math.max(
            (side * side * r) / (s * s),
            (s * s) / (side * side * r)
        );
        if (ratio > worst) worst = ratio;
    }
    return worst;
}

function layoutStrip(
    items: ItemWithArea[],
    rect: Rect,
    out: TreemapRect[]
): void {
    if (items.length === 0) return;
    if (items.length === 1) {
        const { area: _area, ...rest } = items[0];
        out.push({ ...rest, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
        return;
    }

    const vertical = rect.h <= rect.w;
    const side = vertical ? rect.h : rect.w;
    const row: number[] = [items[0].area];
    let i = 1;

    while (i < items.length) {
        const withNext = [...row, items[i].area];
        if (worstRatio(withNext, side) <= worstRatio(row, side)) {
            row.push(items[i].area);
            i++;
        } else {
            break;
        }
    }

    const rowSum = row.reduce((a, b) => a + b, 0);
    const rowThickness = rowSum / side;
    let offset = 0;

    for (let j = 0; j < row.length; j++) {
        const span = row[j] / rowThickness;
        const { area: _area, ...rest } = items[j];
        if (vertical) {
            out.push({ ...rest, x: rect.x, y: rect.y + offset, w: rowThickness, h: span });
        } else {
            out.push({ ...rest, x: rect.x + offset, y: rect.y, w: span, h: rowThickness });
        }
        offset += span;
    }

    const remaining = items.slice(i);
    if (vertical) {
        layoutStrip(remaining, {
            x: rect.x + rowThickness,
            y: rect.y,
            w: rect.w - rowThickness,
            h: rect.h,
        }, out);
    } else {
        layoutStrip(remaining, {
            x: rect.x,
            y: rect.y + rowThickness,
            w: rect.w,
            h: rect.h - rowThickness,
        }, out);
    }
}
