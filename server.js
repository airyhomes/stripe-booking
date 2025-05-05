const express = require("express");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");

app.use(cors());
app.use(express.static("public"));

app.get("/pay", async (req, res) => {
  const { amount, name, email } = req.query;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Booking for ${name}`,
            },
            unit_amount: parseInt(amount),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "https://stripe-booking.onrender.com/success.html",
      cancel_url: "https://stripe-booking.onrender.com/cancel.html",
    });

    res.redirect(session.url);
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).send("Payment setup failed.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));