import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropoffOrder } from './DropoffOrder';

describe('DropoffOrder', () => {
  it('renders pickup then numbered drop-offs in shortest-total order', () => {
    render(
      <DropoffOrder
        result={{ order: ['A', 'B', 'C'], totalDistance: 3 }}
        pickupLabel="เซ็นทรัลเฟสติวัล"
        stops={[
          { id: 'A', label: 'ตลาดกลาง' },
          { id: 'B', label: 'ตลาด (อ้อม)' },
          { id: 'C', label: 'ตลาดลำพูน' },
        ]}
      />,
    );
    expect(screen.getByTestId('stop-pickup')).toHaveTextContent('รับ เซ็นทรัลเฟสติวัล');
    expect(screen.getByTestId('stop-A')).toHaveTextContent('1. ส่ง ตลาดกลาง');
    expect(screen.getByTestId('stop-B')).toHaveTextContent('2. ส่ง ตลาด (อ้อม)');
    expect(screen.getByTestId('stop-C')).toHaveTextContent('3. ส่ง ตลาดลำพูน');
  });
});
