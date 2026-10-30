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
  expect(html.match(/>Different</g)).toHaveLength(4);
});
