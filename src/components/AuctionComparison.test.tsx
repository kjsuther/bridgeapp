import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { HandDetail } from '@/types/review';
import type { AuctionEntry } from '@/types/bridge';
import { AuctionComparison } from './AuctionComparison';

function detail(auction: AuctionEntry[], dealer = 'N'): HandDetail {
  return { auction, dealer, contract: { level: 3, strain: 'NT', declarer: 'S', doubled: 0 } } as HandDetail;
}
const names = { N: 'North player', E: 'East player', S: 'South player', W: 'West player' };
it('compares calls by matching hand after rotation while retaining actual seats and auction order', () => {
  const html = renderToStaticMarkup(<AuctionComparison seatNames={names}
    replaySeats={{ N: 'E', E: 'S', S: 'W', W: 'N' }}
    original={detail([{ seat: 'N', bid: { type: 'bid', level: 1, strain: 'H' } }, { seat: 'E', bid: { type: 'pass' } }])}
    replay={detail([{ seat: 'S', bid: { type: 'pass' } }, { seat: 'E', bid: { type: 'bid', level: 1, strain: 'H' } }], 'S')} />);
  expect(html).toContain('Identical bids for matching hands');
  expect(html).toContain('East player');
  expect(html).toContain('Dealer: S');
  expect(html).toContain('1♥');
  expect(html).toContain('>2</sup>');
});
it('marks differing bids and extra calls, including passes and doubles', () => {
  const html = renderToStaticMarkup(<AuctionComparison seatNames={names}
    original={detail([{ seat: 'N', bid: { type: 'pass' } }])}
    replay={detail([{ seat: 'N', bid: { type: 'double' } }, { seat: 'E', bid: { type: 'redouble' } }])} />);
  expect(html).toContain('2 differing decisions');
  expect(html).toContain('No further call');
  expect(html).toContain('>XX</span>');
  expect(html.match(/>Different</g)).toHaveLength(3);
});

it('leaves two opening blanks when the first bidder is in the third column and wraps the first columns down', () => {
  const auction: AuctionEntry[] = [
    { seat: 'S', bid: { type: 'bid', level: 1, strain: 'H' } },
    { seat: 'W', bid: { type: 'pass' } },
    { seat: 'N', bid: { type: 'bid', level: 2, strain: 'H' } },
    { seat: 'E', bid: { type: 'pass' } },
    { seat: 'S', bid: { type: 'pass' } },
    { seat: 'W', bid: { type: 'pass' } },
  ];
  const html = renderToStaticMarkup(<AuctionComparison seatNames={names}
    original={detail(auction, 'S')} replay={detail(auction, 'S')} />);
  const body = html.match(/<tbody>(.*?)<\/tbody>/)![1];
  const rows = [...body.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => match[1]);
  expect(rows).toHaveLength(2);
  const first = [...rows[0].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
  expect(first[0]).toContain('Before opening bid');
  expect(first[1]).toContain('Before opening bid');
  expect(first[2]).toContain('1♥');
  expect(first[3]).toContain('>2</sup>');
  expect(rows[1]).toContain('2♥');
  expect(rows[1]).toContain('>3</sup>');
});

it('places opening blanks using the replay hand alignment rather than the actual compass seat', () => {
  const auction: AuctionEntry[] = [{ seat: 'N', bid: { type: 'pass' } }, { seat: 'E', bid: { type: 'pass' } }];
  const html = renderToStaticMarkup(<AuctionComparison seatNames={names}
    replaySeats={{ N: 'S', E: 'W', S: 'N', W: 'E' }}
    original={detail(auction)} replay={detail(auction)} />);
  const body = [...html.matchAll(/<tbody>(.*?)<\/tbody>/g)][1][1];
  const cells = [...body.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
  expect(cells[0]).toContain('Before opening bid');
  expect(cells[1]).toContain('Before opening bid');
  expect(cells[2]).toContain('>1</sup>');
  expect(cells[3]).toContain('>2</sup>');
});
