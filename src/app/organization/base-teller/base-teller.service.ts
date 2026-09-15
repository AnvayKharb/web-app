/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/** Angular Imports */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** rxjs Imports */
import { Observable } from 'rxjs';

/**
 * Base Teller service.
 */
@Injectable({
  providedIn: 'root'
})
export class BaseTellerService {
  private http = inject(HttpClient);

  private readonly savingsAccountOpeningsPath = '/v2/base-teller/savings-account-openings';

  /**
   * Searches customers through the Base Teller savings-opening workflow API.
   */
  searchSavingsOpeningCustomers(searchTerm: string, limit: number = 20): Observable<any> {
    const params = new HttpParams().set('q', searchTerm).set('limit', String(limit));
    return this.http.get(`${this.savingsAccountOpeningsPath}/customers`, { params });
  }

  /**
   * Retrieves customer position/details for the Base Teller savings-opening workflow.
   */
  getSavingsOpeningCustomerPosition(clientId: string | number): Observable<any> {
    return this.http.get(`${this.savingsAccountOpeningsPath}/customers/${clientId}/position`);
  }

  /**
   * Retrieves eligible savings products.
   */
  getSavingsOpeningProducts(currencyCode?: string): Observable<any> {
    let params = new HttpParams();
    if (currencyCode) {
      params = params.set('currencyCode', currencyCode);
    }
    return this.http.get(`${this.savingsAccountOpeningsPath}/products`, { params });
  }

  /**
   * Opens and initially funds a savings account through the merged Base Teller workflow endpoint.
   */
  createSavingsAccountOpening(payload: any): Observable<any> {
    return this.http.post(this.savingsAccountOpeningsPath, payload);
  }

  /**
   * Retrieves an authoritative receipt when the backend exposes it separately.
   */
  getSavingsOpeningReceipt(receiptNumber: string | number): Observable<any> {
    return this.http.get(`${this.savingsAccountOpeningsPath}/${receiptNumber}`);
  }

  /**
   * Searches clients and savings accounts using the authoritative platform search endpoint.
   */
  searchDepositCustomersAndAccounts(searchTerm: string): Observable<any> {
    const params = new HttpParams()
      .set('exactMatch', 'false')
      .set('query', searchTerm)
      .set('resource', 'clients,savings');
    return this.http.get('/search', { params });
  }

  /**
   * Retrieves a client profile.
   */
  getDepositClient(clientId: string | number): Observable<any> {
    return this.http.get(`/clients/${clientId}`);
  }

  /**
   * Retrieves the customer's accounts so an existing active savings account can be selected.
   */
  getDepositClientAccounts(clientId: string | number): Observable<any> {
    return this.http.get(`/clients/${clientId}/accounts`);
  }

  /**
   * Retrieves the selected savings account with server-provided balances and status.
   */
  getDepositSavingsAccount(savingsId: string | number): Observable<any> {
    const params = new HttpParams().set('associations', 'all');
    return this.http.get(`/savingsaccounts/${savingsId}`, { params });
  }

  /**
   * Retrieves payment type options for the savings transaction command.
   */
  getSavingsDepositTemplate(savingsId: string | number): Observable<any> {
    return this.http.get(`/savingsaccounts/${savingsId}/transactions/template`);
  }

  /**
   * Deposits funds into an existing savings account.
   */
  depositToSavingsAccount(savingsId: string | number, payload: any): Observable<any> {
    const params = new HttpParams().set('command', 'deposit');
    return this.http.post(`/savingsaccounts/${savingsId}/transactions`, payload, { params });
  }

  /**
   * Retrieves the saved transaction as the authoritative receipt/details response.
   */
  getSavingsDepositReceipt(savingsId: string | number, transactionId: string | number): Observable<any> {
    return this.http.get(`/savingsaccounts/${savingsId}/transactions/${transactionId}`);
  }
}
