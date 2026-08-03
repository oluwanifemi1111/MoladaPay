// services/billService.js
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const UFITPAY_BASE = process.env.UFITPAY_BASE_URL; // e.g. https://api.ufitpay.com/api/v1
const UFITPAY_API_KEY = process.env.UFITPAY_API_KEY;
const UFITPAY_PUBLIC_KEY = process.env.UFITPAY_PUBLIC_KEY;
const UFITPAY_SECRET_KEY = process.env.UFITPAY_SECRET_KEY;

/**
 * Generic UfitPay bill payment
 */

/**
 * Bill payment with auto refund if UfitPay fails
 */
async function payBill(userId, { serviceID, amount, phone, billersCode, variation_code }) {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    //  Step 1: Get user wallet
    const wallet = await Wallet.findOne({ user: userId }).session(session);
    if (!wallet || wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    //  Step 2: Deduct wallet
    wallet.balance -= amount;
    wallet.transactions.push({
      type: "debit",
      amount,
      description: `Bill payment: ${serviceID}`,
    });
    await wallet.save({ session });

    //  Step 3: Create a transaction record
    const [transaction] = await Transaction.create(
      [
        {
          userId,
          amount,
          currency: "NGN",
          type: "bill",
          method: "wallet",
          status: "pending",
        },
      ],
      { session }
    );

    //  Step 4: Call UfitPay
    const payload = {
      request_id: uuidv4(),
      serviceID, // e.g. "mtn", "airtel", "dstv"
      amount,
      phone,
      billersCode, // for TV/electricity
      variation_code, // e.g. "dstv-padi", "prepaid"
    };

    const { data } = await axios.post(`${UFITPAY_BASE}/pay`, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${UFITPAY_API_KEY}`,
      },
    });

    //  Step 5: Handle success
    if (data && data.code === "success") {
      transaction.status = "success";
      await transaction.save({ session });
      await session.commitTransaction();
      return { success: true, data };
    } else {
      //  Step 6: Refund if failed
      wallet.balance += amount;
      wallet.transactions.push({
        type: "credit",
        amount,
        description: `Refund for failed bill: ${serviceID}`,
      });
      await wallet.save({ session });

      transaction.status = "failed";
      await transaction.save({ session });

      await session.commitTransaction();
      return { success: false, error: "Bill payment failed, refunded" };
    }
  } catch (err) {
    await session.abortTransaction();
    console.error("Bill payment error:", err.message);
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = { payBill };