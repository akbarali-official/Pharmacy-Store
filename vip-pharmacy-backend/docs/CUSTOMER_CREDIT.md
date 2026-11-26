# Customer credit (udhaar)

## Concepts
- Each customer has a **credit limit** (default 0 = no credit). Only owners and managers can change it.
- **Balance** = credit sales − payments received − adjustments. A positive balance means the customer owes the store.
- Credit sales reduce stock and appear in sales reports like any other sale; the unpaid part is recorded in the customer's ledger.

## Daily use
1. *Customer Credit* → find the customer → **Limit** to allow credit (e.g. 20,000).
2. At the POS choose the customer, then set Payment to **Credit (pay later)**. Optionally enter an amount paid now.
3. The sale is refused if it would push the balance above the limit.
4. When the customer pays, open *Customer Credit* → **Receive payment**. Cash payments are added to the open cash register session automatically.
5. **Statement** shows every sale and payment with a running balance and can be printed for the customer.

## Returns on credit sales
Record the return in *Sales & Returns* as usual (choose restock if the goods are sellable), then use **Adjust** on the customer's account to reduce the balance by the value returned (reason required). Adjustments are audited.

## Notes
- Owners and managers see every adjustment in the audit log.
- Balances never change by editing old sales; only new ledger entries can change them.
