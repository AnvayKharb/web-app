/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/** Angular Imports */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import {
  MatStepper,
  MatStepperIcon,
  MatStep,
  MatStepLabel,
  MatStepperNext,
  MatStepperPrevious
} from '@angular/material/stepper';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { catchError, debounceTime, distinctUntilChanged, EMPTY, finalize, forkJoin, map, of, switchMap } from 'rxjs';

/** Custom Imports */
import { Dates } from 'app/core/utils/dates';
import { SettingsService } from 'app/settings/settings.service';
import { STANDALONE_SHARED_IMPORTS } from 'app/standalone-shared.module';
import { AuthenticationService } from 'app/core/authentication/authentication.service';
import { environment } from 'environments/environment';
import { BaseTellerService } from '../base-teller.service';

type DepositType = 'CASH' | 'CHECK';

/**
 * Base Teller deposit workflow for existing savings accounts.
 */
@Component({
  selector: 'mifosx-base-teller-savings-account-deposit',
  templateUrl: './savings-account-deposit.component.html',
  styleUrls: ['./savings-account-deposit.component.scss'],
  imports: [
    ...STANDALONE_SHARED_IMPORTS,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatProgressSpinner,
    MatStepper,
    MatStepperIcon,
    MatStep,
    MatStepLabel,
    MatStepperNext,
    MatStepperPrevious,
    CdkTextareaAutosize,
    FaIconComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SavingsAccountDepositComponent implements OnInit {
  private formBuilder = inject(FormBuilder);
  private dateUtils = inject(Dates);
  private settingsService = inject(SettingsService);
  private baseTellerService = inject(BaseTellerService);
  private authenticationService = inject(AuthenticationService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  minDate = new Date(2000, 0, 1);
  maxDate = new Date();
  lookupForm: FormGroup;
  depositForm: FormGroup;

  searchResults: any[] = [];
  customer: any;
  savingsAccounts: any[] = [];
  selectedSavingsAccount: any;
  paymentTypeOptions: any[] = [];
  commandResult: any;
  receipt: any;
  errorMessage = '';
  isSearching = false;
  isLoadingAccounts = false;
  isLoadingTemplate = false;
  isSubmitting = false;
  canAccessWorkflow = false;

  get denominations(): FormArray {
    return this.depositForm.get('denominations') as FormArray;
  }

  get depositType(): DepositType {
    return this.depositForm?.get('depositType')?.value;
  }

  get depositAmount(): number {
    return Number(this.depositForm?.get('transactionAmount')?.value ?? 0);
  }

  get filteredPaymentTypeOptions(): any[] {
    if (this.depositType === 'CASH') {
      return this.paymentTypeOptions.filter((paymentType: any) => paymentType.isCashPayment === true);
    }
    const hasCashMetadata = this.paymentTypeOptions.some((paymentType: any) => 'isCashPayment' in paymentType);
    return hasCashMetadata
      ? this.paymentTypeOptions.filter((paymentType: any) => paymentType.isCashPayment !== true)
      : this.paymentTypeOptions;
  }

  get denominationTotal(): number {
    const total = this.denominations.controls.reduce((sum: number, control: AbstractControl) => {
      const denomination = Number(control.get('denomination')?.value ?? 0);
      const quantity = Number(control.get('quantity')?.value ?? 0);
      return sum + denomination * quantity;
    }, 0);
    return this.toMoneyAmount(total);
  }

  get cashDenominationsReconcile(): boolean {
    return (
      this.depositType !== 'CASH' ||
      (this.denominations.length > 0 &&
        this.toMoneyUnits(this.denominationTotal) === this.toMoneyUnits(this.depositAmount))
    );
  }

  ngOnInit(): void {
    this.canAccessWorkflow = this.hasPermission('DEPOSIT_SAVINGSACCOUNT');
    this.maxDate = this.settingsService.businessDate;
    this.createForms();
    if (!this.canAccessWorkflow) {
      this.errorMessage = 'labels.text.You do not have permission to deposit into savings accounts through Base Teller';
      return;
    }
    this.watchLookup();
    this.watchDepositType();
    this.addDenomination();
  }

  createForms(): void {
    this.lookupForm = this.formBuilder.group({
      search: [
        '',
        Validators.required
      ],
      savingsAccount: [
        '',
        Validators.required
      ]
    });
    this.depositForm = this.formBuilder.group({
      depositType: [
        'CASH',
        Validators.required
      ],
      transactionDate: [
        this.settingsService.businessDate,
        Validators.required
      ],
      transactionAmount: [
        0,
        [
          Validators.required,
          Validators.min(0.01)
        ]
      ],
      paymentTypeId: [
        '',
        Validators.required
      ],
      accountNumber: [
        '',
        Validators.maxLength(50)
      ],
      checkNumber: [
        '',
        Validators.maxLength(50)
      ],
      routingCode: [
        '',
        Validators.maxLength(50)
      ],
      receiptNumber: [
        '',
        Validators.maxLength(50)
      ],
      bankNumber: [
        '',
        Validators.maxLength(50)
      ],
      note: [''],
      denominations: this.formBuilder.array([])
    });
  }

  watchLookup(): void {
    this.lookupForm
      .get('search')
      ?.valueChanges.pipe(
        map((value: any) => (typeof value === 'string' ? value.trim() : '')),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((searchTerm: string) => {
          if (searchTerm.length < 2) {
            this.searchResults = [];
            this.isSearching = false;
            this.cdr.markForCheck();
            return EMPTY;
          }
          this.isSearching = true;
          this.errorMessage = '';
          this.cdr.markForCheck();
          return this.baseTellerService.searchDepositCustomersAndAccounts(searchTerm).pipe(
            catchError((error: any) => {
              this.searchResults = [];
              this.errorMessage =
                this.extractErrorMessage(error) || 'labels.text.Customer or savings account search failed';
              return of([]);
            }),
            finalize(() => {
              this.isSearching = false;
              this.cdr.markForCheck();
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((response: any) => {
        this.searchResults = Array.isArray(response) ? response : response?.pageItems || [];
      });

    this.lookupForm
      .get('savingsAccount')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((account: any) => {
        if (account && typeof account === 'object') {
          this.selectedSavingsAccount = account;
          this.loadDepositTemplate(account.id || account.accountId || account.savingsId);
        }
      });
  }

  watchDepositType(): void {
    this.depositForm
      .get('depositType')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((depositType: DepositType) => {
        this.applyCheckValidators(depositType);
        this.syncSelectedPaymentType();
      });

    this.depositForm
      .get('transactionAmount')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.depositForm.updateValueAndValidity({ emitEvent: false }));
  }

  selectLookupResult(result: any): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    this.customer = null;
    this.savingsAccounts = [];
    this.selectedSavingsAccount = null;
    this.paymentTypeOptions = [];
    this.lookupForm.patchValue({ savingsAccount: '' });
    const resultType = this.entityType(result);
    if (resultType === 'savings') {
      this.loadSavingsAccount(result.entityId || result.accountId);
      return;
    }
    this.loadClientAccounts(result.entityId || result.id || result.clientId);
  }

  loadClientAccounts(clientId: string | number): void {
    this.isLoadingAccounts = true;
    forkJoin({
      customer: this.baseTellerService.getDepositClient(clientId).pipe(catchError(() => of(null))),
      accounts: this.baseTellerService.getDepositClientAccounts(clientId)
    })
      .pipe(
        finalize(() => {
          this.isLoadingAccounts = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ customer, accounts }: any) => {
          this.customer = customer;
          this.savingsAccounts = this.activeSavingsAccounts(
            accounts?.savingsAccounts || accounts?.savingAccounts || []
          );
          if (!this.savingsAccounts.length) {
            this.errorMessage = 'labels.text.No active savings accounts available for this customer';
          }
        },
        error: (error: any) => {
          this.errorMessage = this.extractErrorMessage(error) || 'labels.text.Savings accounts could not be loaded';
        }
      });
  }

  loadSavingsAccount(savingsId: string | number): void {
    this.isLoadingAccounts = true;
    this.baseTellerService
      .getDepositSavingsAccount(savingsId)
      .pipe(
        finalize(() => {
          this.isLoadingAccounts = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (account: any) => {
          this.selectedSavingsAccount = account;
          this.savingsAccounts = this.isActiveSavingsAccount(account) ? [account] : [];
          this.customer = {
            id: account.clientId,
            displayName: account.clientName || account.clientDisplayName
          };
          if (this.savingsAccounts.length) {
            this.lookupForm.patchValue({ savingsAccount: account });
            this.loadDepositTemplate(account.id || account.accountId || account.savingsId);
          } else {
            this.errorMessage = 'labels.text.Selected savings account is not active';
          }
        },
        error: (error: any) => {
          this.errorMessage = this.extractErrorMessage(error) || 'labels.text.Savings account could not be loaded';
        }
      });
  }

  loadDepositTemplate(savingsId: string | number): void {
    this.isLoadingTemplate = true;
    this.baseTellerService
      .getSavingsDepositTemplate(savingsId)
      .pipe(
        finalize(() => {
          this.isLoadingTemplate = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (template: any) => {
          this.paymentTypeOptions = template?.paymentTypeOptions || [];
          this.syncSelectedPaymentType();
          if (!this.filteredPaymentTypeOptions.length) {
            this.errorMessage = 'labels.text.No eligible payment types available';
          }
        },
        error: (error: any) => {
          this.paymentTypeOptions = [];
          this.errorMessage = this.extractErrorMessage(error) || 'labels.text.Payment types could not be loaded';
        }
      });
  }

  addDenomination(): void {
    this.denominations.push(
      this.formBuilder.group({
        denomination: [
          '',
          [
            Validators.required,
            Validators.min(0.01)
          ]
        ],
        quantity: [
          1,
          [
            Validators.required,
            Validators.min(1)
          ]
        ]
      })
    );
  }

  removeDenomination(index: number): void {
    this.denominations.removeAt(index);
  }

  selectedDenominationLineTotal(control: AbstractControl): number {
    const denomination = Number(control.get('denomination')?.value ?? 0);
    const quantity = Number(control.get('quantity')?.value ?? 0);
    return this.toMoneyAmount(denomination * quantity);
  }

  displayLookupResult(result: any): string {
    if (!result) {
      return '';
    }
    return `${result.entityAccountNo || result.accountNo || result.id || result.entityId || ''} - ${
      result.entityName || result.displayName || result.name || ''
    }`;
  }

  displaySavingsAccount(account: any): string {
    if (!account) {
      return '';
    }
    return `${account.accountNo || account.accountNumber || account.id || ''} - ${
      account.productName || account.savingsProductName || ''
    }`;
  }

  proceedToPreview(): boolean {
    this.errorMessage = '';
    if (!this.lookupForm.valid || !this.depositForm.valid) {
      return false;
    }
    if (!this.cashDenominationsReconcile) {
      this.errorMessage = 'labels.text.Cash denomination total must equal the transaction amount';
      return false;
    }
    return true;
  }

  submit(): void {
    this.errorMessage = '';
    if (!this.proceedToPreview() || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.baseTellerService
      .depositToSavingsAccount(this.selectedSavingsAccountId(), this.buildPayload())
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          this.commandResult = response;
          this.receipt = response;
          const transactionId = response?.resourceId || response?.entityId || response?.transactionId;
          if (transactionId) {
            this.loadReceipt(transactionId);
          }
        },
        error: (error: any) => {
          this.errorMessage = this.extractErrorMessage(error) || 'labels.text.Savings account deposit failed';
        }
      });
  }

  buildPayload(): any {
    const depositFormData = this.refineObject(this.depositForm.value);
    const dateFormat = this.settingsService.dateFormat;
    const transactionDate =
      depositFormData.transactionDate instanceof Date
        ? this.dateUtils.formatDate(depositFormData.transactionDate, dateFormat)
        : depositFormData.transactionDate;
    delete depositFormData.depositType;
    delete depositFormData.denominations;

    if (this.depositType === 'CASH') {
      delete depositFormData.accountNumber;
      delete depositFormData.checkNumber;
      delete depositFormData.routingCode;
      delete depositFormData.bankNumber;
    }

    return this.refineObject({
      ...depositFormData,
      transactionDate,
      transactionAmount: Number(depositFormData.transactionAmount),
      dateFormat,
      locale: this.settingsService.language.code
    });
  }

  printReceipt(): void {
    window.print();
  }

  paymentTypeName(paymentTypeId: string | number): string {
    const paymentType = this.paymentTypeOptions.find((option: any) => option.id === paymentTypeId);
    return paymentType?.name || paymentType?.value || '';
  }

  accountCurrencyCode(): string {
    return this.selectedSavingsAccount?.currency?.code || this.selectedSavingsAccount?.currencyCode || '';
  }

  private loadReceipt(transactionId: string | number): void {
    this.baseTellerService.getSavingsDepositReceipt(this.selectedSavingsAccountId(), transactionId).subscribe({
      next: (receipt: any) => {
        this.receipt = receipt;
        this.cdr.markForCheck();
      },
      error: () => {
        this.receipt = this.commandResult;
        this.cdr.markForCheck();
      }
    });
  }

  private activeSavingsAccounts(accounts: any[]): any[] {
    return accounts.filter((account: any) => this.isActiveSavingsAccount(account));
  }

  private isActiveSavingsAccount(account: any): boolean {
    return (
      account?.status?.active === true ||
      account?.status?.value === 'Active' ||
      account?.status?.code === 'savingsAccountStatusType.active'
    );
  }

  private entityType(result: any): string {
    return String(result.entityType || result.subEntityType || result.accountType || '').toLowerCase();
  }

  private selectedSavingsAccountId(): string | number {
    return (
      this.selectedSavingsAccount?.id ||
      this.selectedSavingsAccount?.accountId ||
      this.selectedSavingsAccount?.savingsId
    );
  }

  private applyCheckValidators(depositType: DepositType): void {
    [
      'accountNumber',
      'checkNumber',
      'routingCode',
      'bankNumber'
    ].forEach((controlName: string) => {
      const control = this.depositForm.get(controlName);
      control?.clearValidators();
      control?.addValidators(Validators.maxLength(50));
      if (depositType === 'CHECK') {
        control?.addValidators(Validators.required);
      }
      control?.updateValueAndValidity({ emitEvent: false });
    });
  }

  private syncSelectedPaymentType(): void {
    const paymentTypeControl = this.depositForm?.get('paymentTypeId');
    const selectedPaymentTypeId = paymentTypeControl?.value;
    const filteredOptions = this.filteredPaymentTypeOptions;
    if (
      selectedPaymentTypeId &&
      !filteredOptions.some((paymentType: any) => paymentType.id === selectedPaymentTypeId)
    ) {
      paymentTypeControl?.setValue('');
      return;
    }
    if (!selectedPaymentTypeId && filteredOptions.length === 1) {
      paymentTypeControl?.setValue(filteredOptions[0].id);
    }
  }

  private hasPermission(permission: string): boolean {
    if (!environment.productionModeEnableRBAC) {
      return true;
    }
    const userPermissions = this.authenticationService.getCredentials()?.permissions ?? [];
    return (
      userPermissions.includes('ALL_FUNCTIONS') ||
      (permission.startsWith('READ_') && userPermissions.includes('ALL_FUNCTIONS_READ')) ||
      userPermissions.includes(permission)
    );
  }

  private extractErrorMessage(error: any): string {
    return (
      error?.error?.defaultUserMessage ||
      error?.error?.developerMessage ||
      error?.error?.message ||
      error?.message ||
      ''
    );
  }

  private toMoneyAmount(value: number): number {
    return this.toMoneyUnits(value) / 1000000;
  }

  private toMoneyUnits(value: number): number {
    return Math.round((Number(value) || 0) * 1000000);
  }

  private refineObject(dataObj: any): any {
    const refined = { ...dataObj };
    Object.keys(refined).forEach((key: string) => {
      if (refined[key] === null || refined[key] === undefined || refined[key] === '') {
        delete refined[key];
      }
    });
    return refined;
  }
}
