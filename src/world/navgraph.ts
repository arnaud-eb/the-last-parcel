/**
 * Driving graph over the street network, for bots and reachability checks:
 * nodes every few metres along each road and a grid across each square,
 * linked along roads and wherever two roads or a road and a square meet.
 */
import { frameAt, roadLength } from './roads';
import { PLAZAS, ROADS } from './town';

export type NavNode = { x: number; y: number; z: number; links: number[] };

const STEP = 5;
const JOIN = 7; // nodes of different roads closer than this are linked (junctions)

export class NavGraph {
  readonly nodes: NavNode[] = [];

  constructor() {
    const groups: number[][] = [];
    for (const road of ROADS) {
      const len = roadLength(road);
      const ids: number[] = [];
      const n = Math.max(1, Math.round(len / STEP));
      for (let i = 0; i <= n; i++) {
        const f = frameAt(road, (len * i) / n);
        ids.push(this.add(f.x, f.y, f.z));
        if (i > 0) this.link(ids[i - 1]!, ids[i]!);
      }
      groups.push(ids);
    }
    for (const p of PLAZAS) {
      const ids: number[] = [];
      const cols = Math.max(2, Math.round((p.hx * 2) / 8));
      const rows = Math.max(2, Math.round((p.hz * 2) / 8));
      const grid: number[][] = [];
      for (let r = 0; r <= rows; r++) {
        grid.push([]);
        for (let c = 0; c <= cols; c++) {
          const id = this.add(p.x - p.hx + 1 + ((p.hx * 2 - 2) * c) / cols, p.y, p.z - p.hz + 1 + ((p.hz * 2 - 2) * r) / rows);
          grid[r]!.push(id);
          ids.push(id);
          if (c > 0) this.link(grid[r]![c - 1]!, id);
          if (r > 0) this.link(grid[r - 1]![c]!, id);
        }
      }
      groups.push(ids);
    }
    // Junctions: link nearby nodes that belong to different groups, at matching heights.
    for (let g = 0; g < groups.length; g++) {
      for (let h = g + 1; h < groups.length; h++) {
        for (const a of groups[g]!) {
          for (const b of groups[h]!) {
            const na = this.nodes[a]!;
            const nb = this.nodes[b]!;
            if (Math.hypot(na.x - nb.x, na.z - nb.z) < JOIN && Math.abs(na.y - nb.y) < 1.5) this.link(a, b);
          }
        }
      }
    }
  }

  private add(x: number, y: number, z: number): number {
    this.nodes.push({ x, y, z, links: [] });
    return this.nodes.length - 1;
  }

  private link(a: number, b: number): void {
    if (a === b || this.nodes[a]!.links.includes(b)) return;
    this.nodes[a]!.links.push(b);
    this.nodes[b]!.links.push(a);
  }

  nearest(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** A* shortest path between the nodes nearest to two points; null if unreachable. */
  path(fromX: number, fromZ: number, toX: number, toZ: number): NavNode[] | null {
    const start = this.nearest(fromX, fromZ);
    const goal = this.nearest(toX, toZ);
    const g = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const open = new Set([start]);
    const h = (i: number) => Math.hypot(this.nodes[i]!.x - this.nodes[goal]!.x, this.nodes[i]!.z - this.nodes[goal]!.z);
    while (open.size) {
      let cur = -1;
      let best = Infinity;
      for (const i of open) {
        const f = g.get(i)! + h(i);
        if (f < best) {
          best = f;
          cur = i;
        }
      }
      if (cur === goal) {
        const out = [this.nodes[cur]!];
        while (came.has(cur)) {
          cur = came.get(cur)!;
          out.unshift(this.nodes[cur]!);
        }
        return out;
      }
      open.delete(cur);
      for (const nb of this.nodes[cur]!.links) {
        const d = g.get(cur)! + Math.hypot(this.nodes[nb]!.x - this.nodes[cur]!.x, this.nodes[nb]!.z - this.nodes[cur]!.z);
        if (d < (g.get(nb) ?? Infinity)) {
          g.set(nb, d);
          came.set(nb, cur);
          open.add(nb);
        }
      }
    }
    return null;
  }
}
