import { Link, useParams } from 'react-router-dom';
import { computeFare } from '@drop/carpool-core';
import { FARE_PRIVATE_SEATS, FARE_TAXI_SEATS, demoPreview } from '../fixtures';
import { FareSummary } from '../components/FareSummary';

const LABELS = { A: 'เอ', B: 'บี', C: 'ซี', driver: 'ส่วนของคนขับ' };

export function FareSummaryPage() {
  const { id = '' } = useParams();
  const preview = demoPreview(id);
  const taxi = preview?.kind !== 'private' && (id.includes('taxi') || preview?.kind === 'taxi');
  const result = computeFare({
    vehicle: taxi ? 'taxi' : 'private_car',
    mainRouteKm: preview?.route_km ?? 12,
    seats: taxi ? FARE_TAXI_SEATS : FARE_PRIVATE_SEATS,
  });

  return (
    <main className="page">
      <p>
        <Link to={`/trips/${id}`}>← ร่วมทริป</Link>
      </p>
      <FareSummary result={result} labels={LABELS} kind={taxi ? 'taxi' : 'private'} />
      <p>
        <Link to={`/trips/${id}/order`} className="btn tap-target">
          {taxi ? 'ดูสรุปทริป' : 'มุมคนขับ'}
        </Link>
      </p>
    </main>
  );
}
