"use client";

import { useState, useCallback } from "react";
import { useAuth } from "../lib/use-auth";
import { auth } from "../lib/firebase-client";
import { signOut } from "firebase/auth";

interface Instalment {
  id: string;
  instalmentNumber: number;
  dueDate: string;
  principalComponent: number;
  interestComponent: number;
  totalDue: number;
  amountPaid: number;
}

interface LoanPosition {
  outstandingPrincipal: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  overdueAmount: number;
}

interface Loan {
  id: string;
  principal: number;
  emiAmount: number;
  instalments: Instalment[];
  position: LoanPosition;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HomePage() {
  const { user, loading } = useAuth();

  const [loanId, setLoanId] = useState("");
  const [loan, setLoan] = useState<Loan | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchLoan = useCallback(
    async (id: string) => {
      if (!user || !id) return;

      setFetchError("");

      try {
        const token = await user.getIdToken();

        const res = await fetch(`/api/loans/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await res.json();

        if (!res.ok) {
          setFetchError(
            json.error?.message ?? "Failed to load loan"
          );
          setLoan(null);
          return;
        }

        setLoan(json.data);
      } catch {
        setFetchError("Failed to load loan");
      }
    },
    [user]
  );

  async function handleRecordPayment(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!user || !loan) return;

    setPaymentError("");
    setSubmitting(true);

    try {
      const amountPaise = Math.round(
        parseFloat(paymentAmount) * 100
      );

      if (!amountPaise || amountPaise <= 0) {
        setPaymentError("Enter a valid amount");
        setSubmitting(false);
        return;
      }

      if (!paymentDate) {
        setPaymentError("Pick a date");
        setSubmitting(false);
        return;
      }

      const token = await user.getIdToken();

      const res = await fetch(
        `/api/loans/${loan.id}/payments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amountPaise,
            date: new Date(paymentDate).toISOString(),
          }),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        setPaymentError(
          json.error?.message ?? "Payment failed"
        );
        setSubmitting(false);
        return;
      }

      setPaymentAmount("");
      setPaymentDate("");

      await fetchLoan(loan.id);
    } catch {
      setPaymentError("Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Vitto Loan Service</h1>
          <p>Sign in to manage your loan.</p>

          <a href="/login">Sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">

        {/* Header */}
        <header className="header">
          <h1 className="brand">Vitto Loan Service</h1>

          <div className="user-area">
            <span className="user-email">
              {user.email}
            </span>

            <button
              className="sign-out"
              onClick={() => signOut(auth)}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Loan Search */}
        <div className="loan-search">
          <input
            placeholder="Enter Loan ID"
            value={loanId}
            onChange={(e) => setLoanId(e.target.value)}
          />

          <button onClick={() => fetchLoan(loanId)}>
            Load loan
          </button>
        </div>

        {fetchError && (
          <p className="error">{fetchError}</p>
        )}

        {loan && (
          <>
            {/* Current Position */}
            <section className="card position-card">
              <h2>Current Position</h2>

              <div className="position-grid">

                <div className="position-item">
                  <span className="position-label">
                    Outstanding Principal
                  </span>

                  <span className="position-value">
                    {formatRupees(
                      loan.position.outstandingPrincipal
                    )}
                  </span>
                </div>

                <div className="position-item">
                  <span className="position-label">
                    Next Due
                  </span>

                  <span className="position-value">
                    {loan.position.nextDueDate
                      ? formatDate(
                          loan.position.nextDueDate
                        )
                      : "—"}
                  </span>

                  {loan.position.nextDueDate && (
                    <span className="position-label">
                      {formatRupees(
                        loan.position.nextDueAmount
                      )}
                    </span>
                  )}
                </div>

                <div className="position-item">
                  <span className="position-label">
                    Overdue Amount
                  </span>

                  <span
                    className={
                      loan.position.overdueAmount > 0
                        ? "position-value overdue-value"
                        : "position-value"
                    }
                  >
                    {formatRupees(
                      loan.position.overdueAmount
                    )}
                  </span>
                </div>

              </div>
            </section>

            {/* Repayment Schedule */}
            <section className="card">
              <h2>Repayment Schedule</h2>

              <div className="table-wrapper">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due Date</th>
                      <th>Principal</th>
                      <th>Interest</th>
                      <th>Total Due</th>
                      <th>Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loan.instalments.map((i) => {
                      const isPaid =
                        i.amountPaid >= i.totalDue;

                      const isOverdue =
                        !isPaid &&
                        new Date(i.dueDate) < new Date();

                      return (
                        <tr key={i.id}>
                          <td>{i.instalmentNumber}</td>

                          <td>
                            {formatDate(i.dueDate)}
                          </td>

                          <td>
                            {formatRupees(
                              i.principalComponent
                            )}
                          </td>

                          <td>
                            {formatRupees(
                              i.interestComponent
                            )}
                          </td>

                          <td>
                            {formatRupees(i.totalDue)}
                          </td>

                          <td>
                            {formatRupees(i.amountPaid)}
                          </td>

                          <td
                            className={
                              isPaid
                                ? "status-paid"
                                : isOverdue
                                  ? "status-overdue"
                                  : "status-pending"
                            }
                          >
                            {isPaid
                              ? "Paid"
                              : isOverdue
                                ? "Overdue"
                                : "Pending"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Record Payment */}
            <section className="card">
              <h2>Record a Payment</h2>

              <form
                onSubmit={handleRecordPayment}
                className="payment-form"
              >
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Amount (₹)"
                  value={paymentAmount}
                  onChange={(e) =>
                    setPaymentAmount(e.target.value)
                  }
                  required
                />

                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) =>
                    setPaymentDate(e.target.value)
                  }
                  required
                />

                <button
                  type="submit"
                  disabled={submitting}
                >
                  {submitting
                    ? "Recording..."
                    : "Record Payment"}
                </button>
              </form>

              {paymentError && (
                <p className="error">{paymentError}</p>
              )}
            </section>
          </>
        )}

      </div>
    </div>
  );
}