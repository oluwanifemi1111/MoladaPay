import axios from "axios";

const API_KEY = "9ee9bb86329e35bd448abb93"; // store your key in .env
const BASE_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}`;

export async function convertCurrency(fromCurrency, toCurrency, amount) {
  try {
    const url = `${BASE_URL}/pair/${fromCurrency}/${toCurrency}/${amount}`;
    const response = await axios.get(url);

    if (response.data.result === "success") {
      return response.data.conversion_result;
    } else {
      throw new Error(`Conversion failed: ${response.data['error-type']}`);
    }
  } catch (error) {
    console.error("Currency conversion error:", error.message);
    throw new Error("Conversion failed");
  }
}