import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LuggageBlock } from './LuggageBlock';

describe('LuggageBlock', () => {
  it('shows a red overflow block when luggage exceeds the trunk', () => {
    render(
      <LuggageBlock
        widthCm={100}
        heightCm={50}
        lengthCm={50}
        luggage={[{ riderId: 'you', heightCm: 80, widthCm: 60, depthCm: 55 }]}
      />,
    );
    expect(screen.getByTestId('luggage-overflow')).toHaveTextContent('สัมภาระเกินพื้นที่ท้ายรถ');
  });

  it('does not block when luggage fits', () => {
    render(
      <LuggageBlock
        widthCm={100}
        heightCm={50}
        lengthCm={50}
        luggage={[{ riderId: 'you', heightCm: 50, widthCm: 40, depthCm: 25 }]}
      />,
    );
    expect(screen.queryByTestId('luggage-overflow')).toBeNull();
  });
});
