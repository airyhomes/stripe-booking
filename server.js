
const express = require("express");
const app = express();
const stripe = require("stripe")("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");
const bodyParser = require("body-parser");
const cors = require("cors");

app.use(cors());
app.use(bodyParser.json());

app.post("/create-checkout-session", async (req, res) => {
    const { amount } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "eur",
                        product_data: {
                            name: "Vacation Rental Booking",
                        },
                        unit_amount: amount,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: "https://yourdomain.com/success.html",
            cancel_url: "https://yourdomain.com/cancel.html",
        });

        res.json({ id: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(4242, () => console.log("Server running on http://localhost:4242"));
