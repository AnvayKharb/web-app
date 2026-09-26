/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { afterEach, describe, expect, it } from '@jest/globals';

import { environment } from 'environments/environment';
import { BASE_TELLER_WORKFLOWS, BaseTellerComponent } from './base-teller.component';

describe('BaseTellerComponent', () => {
  const originalProductionMode = environment.productionMode;

  afterEach(() => {
    environment.productionMode = originalProductionMode;
  });

  it('exposes WEB-1221 as one permission-protected block on the dedicated Base Teller page', () => {
    expect(BASE_TELLER_WORKFLOWS[0]).toEqual({
      label: 'cashAllocation.title',
      materialIcon: 'point_of_sale',
      permission: 'READ_BASE_TELLER_CASH_ALLOCATION',
      route: [
        '/organization',
        'base-teller',
        'cash-allocations'
      ]
    });
  });

  it('preserves the existing Base Teller workflows and production visibility', () => {
    environment.productionMode = false;
    expect(new BaseTellerComponent().workflows.map((workflow) => workflow.route.at(-1))).toEqual([
      'cash-allocations',
      'savings-account-openings',
      'savings-account-deposits',
      'returned-check-payments'
    ]);
    environment.productionMode = true;
    expect(new BaseTellerComponent().workflows.at(-1)?.route.at(-1)).toBe('service-payments');
  });
});
