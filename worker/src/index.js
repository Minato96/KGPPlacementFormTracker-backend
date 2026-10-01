const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

/*
 * ------------------------------------------------------------
 * CASHFREE WEBHOOK SIGNATURE
 * ------------------------------------------------------------
 *
 * Cashfree signature:
 *
 * Base64(
 *   HMAC-SHA256(
 *     timestamp + rawBody,
 *     CASHFREE_SECRET_KEY
 *   )
 * )
 * ------------------------------------------------------------
 */
async function generateCashfreeSignature(
  timestamp,
  rawBody,
  secret
) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(timestamp + rawBody)
  );

  let binary = "";

  const bytes = new Uint8Array(signatureBytes);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/*
 * Constant-time string comparison.
 */
function safeCompare(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/*
 * ------------------------------------------------------------
 * MAIN WORKER
 * ------------------------------------------------------------
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * --------------------------------------------------------
     * CORS PREFLIGHT
     * --------------------------------------------------------
     */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    /*
     * --------------------------------------------------------
     * HEALTH CHECK
     * --------------------------------------------------------
     */
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return jsonResponse({
        status: "ok",
        service: "KGP Placement Form Tracker Backend",
      });
    }

    /*
     * --------------------------------------------------------
     * CREATE ORDER
     * --------------------------------------------------------
     *
     * POST /create-order
     *
     * Body:
     * {
     *   "installation_id": "..."
     * }
     *
     * The amount is controlled by the server.
     * --------------------------------------------------------
     */
    if (
      request.method === "POST" &&
      url.pathname === "/create-order"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            error: "Invalid JSON body",
          },
          400
        );
      }

      const installationId =
        body?.installation_id;

      if (
        !installationId ||
        typeof installationId !== "string" ||
        installationId.length < 10 ||
        installationId.length > 200
      ) {
        return jsonResponse(
          {
            success: false,
            error: "Invalid installation_id",
          },
          400
        );
      }

      /*
       * Server-generated order ID.
       */
      const randomPart =
        crypto.randomUUID().replaceAll("-", "");

      const orderId =
        `kgp_pro_${Date.now()}_${randomPart}`;

      /*
       * Sandbox test amount.
       *
       * Change this later for production.
       */
      const orderAmount = 1.0;

      /*
       * ------------------------------------------------------
       * CREATE CASHFREE ORDER
       * ------------------------------------------------------
       */
      const cashfreeResponse = await fetch(
        "https://sandbox.cashfree.com/pg/orders",
        {
          method: "POST",

          headers: {
            "x-client-id":
              env.CASHFREE_APP_ID,

            "x-client-secret":
              env.CASHFREE_SECRET_KEY,

            "x-api-version":
              "2025-01-01",

            Accept:
              "application/json",

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            order_id: orderId,

            order_amount: orderAmount,

            order_currency: "INR",

            customer_details: {
              customer_id: installationId,

              /*
               * Sandbox value.
               *
               * Replace appropriately for production.
               */
              customer_phone: "9999999999",
            },

            order_meta: {
              return_url:
                "https://kgp-placement-form-tracker-backend.noticeboard.workers.dev/payment-return?order_id={order_id}",

              notify_url:
                "https://kgp-placement-form-tracker-backend.noticeboard.workers.dev/payment-webhook",
            },

            order_note:
              "KGP Placement Form Tracker PRO - Sandbox",
          }),
        }
      );

      /*
       * Cashfree order creation failed.
       */
      if (!cashfreeResponse.ok) {
        const errorText =
          await cashfreeResponse.text();

        console.error(
          "Cashfree create-order error:",
          errorText
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Cashfree order creation failed",
          },
          502
        );
      }

      const cashfreeData =
        await cashfreeResponse.json();

      /*
       * ------------------------------------------------------
       * LICENSE RECORD
       * ------------------------------------------------------
       *
       * One installation has one license row.
       *
       * New installation:
       *     INSERT
       *
       * Existing PENDING:
       *     UPDATE to new order
       *
       * Existing ACTIVE:
       *     return already_active
       * ------------------------------------------------------
       */
      try {
        const existingLicense =
          await env
            .kgp_placement_form_tracker_db
            .prepare(
              `SELECT
                 installation_id,
                 status,
                 order_id
               FROM licenses
               WHERE installation_id = ?
               LIMIT 1`
            )
            .bind(installationId)
            .first();

        /*
         * Already paid.
         */
        if (
          existingLicense &&
          existingLicense.status === "ACTIVE"
        ) {
          return jsonResponse({
            success: true,

            already_active: true,

            pro: true,

            status: "ACTIVE",

            order_id:
              existingLicense.order_id,
          });
        }

        /*
         * Existing inactive/pending license.
         *
         * Replace the current order with the new one.
         */
        if (existingLicense) {
          await env
            .kgp_placement_form_tracker_db
            .prepare(
              `UPDATE licenses
               SET
                 order_id = ?,
                 payment_id = NULL,
                 status = 'PENDING',
                 created_at = ?,
                 activated_at = NULL
               WHERE installation_id = ?`
            )
            .bind(
              orderId,
              Date.now(),
              installationId
            )
            .run();
        } else {
          /*
           * New installation.
           */
          await env
            .kgp_placement_form_tracker_db
            .prepare(
              `INSERT INTO licenses
                (
                  installation_id,
                  order_id,
                  payment_id,
                  status,
                  created_at,
                  activated_at
                )
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(
              installationId,
              orderId,
              null,
              "PENDING",
              Date.now(),
              null
            )
            .run();
        }
      } catch (dbError) {
        console.error(
          "D1 license record operation failed:",
          dbError
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Could not create license record",
          },
          500
        );
      }

      return jsonResponse({
        success: true,

        order_id: orderId,

        payment_session_id:
          cashfreeData.payment_session_id,
      });
    }

    /*
     * --------------------------------------------------------
     * HOSTED CASHFREE CHECKOUT
     * --------------------------------------------------------
     *
     * GET /checkout?installation_id=...
     *
     * IMPORTANT:
     *
     * The Worker only serves this HTML page.
     *
     * The browser itself calls /create-order.
     *
     * This avoids Cloudflare Worker self-fetch error 1042.
     * --------------------------------------------------------
     */
    if (
      request.method === "GET" &&
      url.pathname === "/checkout"
    ) {
      const installationId =
        url.searchParams.get(
          "installation_id"
        );

      if (
        !installationId ||
        typeof installationId !== "string" ||
        installationId.length < 10 ||
        installationId.length > 200
      ) {
        return new Response(
          `
          <!DOCTYPE html>

          <html>

          <head>

            <meta charset="UTF-8">

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            >

            <title>
              KGP Placement Form Tracker
            </title>

            <style>

              body {
                font-family:
                  Arial,
                  sans-serif;

                background:
                  #f5f7fb;

                padding:
                  40px;

                text-align:
                  center;
              }

              .card {
                max-width:
                  520px;

                margin:
                  60px auto;

                background:
                  white;

                padding:
                  40px;

                border-radius:
                  16px;

                box-shadow:
                  0 10px 30px
                  rgba(0,0,0,.08);
              }

              .error {
                color:
                  #dc2626;

                font-weight:
                  bold;
              }

            </style>

          </head>

          <body>

            <div class="card">

              <h1>
                KGP Placement Form Tracker
              </h1>

              <p class="error">
                Unable to start checkout
              </p>

              <p>
                Invalid installation ID.
              </p>

            </div>

          </body>

          </html>
          `,
          {
            status: 400,

            headers: {
              "Content-Type":
                "text/html; charset=UTF-8",
            },
          }
        );
      }

      /*
       * Safely embed installation ID in JavaScript.
       */
      const safeInstallationId =
        JSON.stringify(installationId)
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026");

      return new Response(
        `
        <!DOCTYPE html>

        <html lang="en">

        <head>

          <meta charset="UTF-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >

          <title>
            KGP Placement Form Tracker - PRO
          </title>

          <script
            src="https://sdk.cashfree.com/js/v3/cashfree.js"
          ></script>

          <style>

            * {
              box-sizing:
                border-box;
            }

            body {
              margin:
                0;

              min-height:
                100vh;

              display:
                flex;

              justify-content:
                center;

              align-items:
                center;

              font-family:
                Arial,
                Helvetica,
                sans-serif;

              background:
                #f5f7fb;

              color:
                #111827;
            }

            .card {
              width:
                min(92%, 520px);

              background:
                white;

              padding:
                40px;

              border-radius:
                18px;

              box-shadow:
                0 12px 35px
                rgba(0,0,0,.08);

              text-align:
                center;
            }

            .brand {
              font-size:
                14px;

              font-weight:
                600;

              color:
                #6b7280;

              margin-bottom:
                12px;
            }

            h1 {
              margin:
                0 0 8px;
            }

            .subtitle {
              color:
                #6b7280;

              line-height:
                1.5;

              margin-bottom:
                28px;
            }

            .price {
              font-size:
                34px;

              font-weight:
                700;

              margin:
                20px 0;
            }

            button {
              width:
                100%;

              border:
                none;

              padding:
                14px 18px;

              border-radius:
                10px;

              background:
                #111827;

              color:
                white;

              font-size:
                16px;

              font-weight:
                600;

              cursor:
                pointer;
            }

            button:hover {
              opacity:
                .92;
            }

            button:disabled {
              opacity:
                .6;

              cursor:
                not-allowed;
            }

            .order {
              margin-top:
                22px;

              padding:
                12px;

              border-radius:
                8px;

              background:
                #f3f4f6;

              font-size:
                12px;

              word-break:
                break-all;

              color:
                #6b7280;
            }

            .message {
              margin-top:
                18px;

              font-size:
                14px;

              color:
                #dc2626;
            }

            .loading {
              color:
                #6b7280;

              font-size:
                14px;
            }

            .success {
              color:
                #16a34a;

              font-weight:
                600;
            }

          </style>

        </head>

        <body>

          <div class="card">

            <div class="brand">
              KGP Placement Form Tracker
            </div>

            <h1>
              Unlock PRO
            </h1>

            <p class="subtitle">
              Unlock live time remaining and
              application/form links.
            </p>

            <div class="price">
              ₹1
            </div>

            <p
              id="loading"
              class="loading"
            >
              Preparing secure payment...
            </p>

            <button
              id="payButton"
              disabled
            >
              Loading...
            </button>

            <div
              id="order"
              class="order"
              style="display:none;"
            ></div>

            <div
              id="message"
              class="message"
            ></div>

          </div>


          <script>

            const API_BASE =
              window.location.origin;

            const installationId =
              ${safeInstallationId};


            const loading =
              document.getElementById(
                "loading"
              );

            const button =
              document.getElementById(
                "payButton"
              );

            const orderBox =
              document.getElementById(
                "order"
              );

            const message =
              document.getElementById(
                "message"
              );


            let paymentSessionId =
              null;


            /*
             * ------------------------------------------------
             * HTML ESCAPE
             * ------------------------------------------------
             */
            function escapeHtml(value) {

              return String(value)
                .replace(
                  /&/g,
                  "&amp;"
                )
                .replace(
                  /</g,
                  "&lt;"
                )
                .replace(
                  />/g,
                  "&gt;"
                )
                .replace(
                  /"/g,
                  "&quot;"
                );

            }


            /*
             * ------------------------------------------------
             * CREATE ORDER
             * ------------------------------------------------
             */
            async function createOrder() {

              try {

                const response =
                  await fetch(
                    API_BASE +
                    "/create-order",
                    {
                      method:
                        "POST",

                      headers: {
                        "Content-Type":
                          "application/json"
                      },

                      body:
                        JSON.stringify({
                          installation_id:
                            installationId
                        })
                    }
                  );


                const data =
                  await response.json();


                if (!response.ok) {
                  throw new Error(
                    data?.error ||
                    "Failed to create order"
                  );
                }


                /*
                 * Already active.
                 */
                if (
                  data.already_active ===
                  true
                ) {

                  loading.style.display =
                    "none";

                  button.disabled =
                    true;

                  button.textContent =
                    "PRO Already Active";

                  message.className =
                    "message success";

                  message.textContent =
                    "This installation already has PRO access.";

                  return;
                }


                paymentSessionId =
                  data.payment_session_id;


                if (!paymentSessionId) {
                  throw new Error(
                    "Missing payment session ID"
                  );
                }


                orderBox.style.display =
                  "block";

                orderBox.innerHTML =
                  "<strong>Order ID</strong>" +
                  "<br><br>" +
                  escapeHtml(
                    data.order_id
                  );


                loading.style.display =
                  "none";

                button.disabled =
                  false;

                button.textContent =
                  "Proceed to Pay";


              } catch (error) {

                console.error(
                  "Create order failed:",
                  error
                );

                loading.style.display =
                  "none";

                button.disabled =
                  true;

                button.textContent =
                  "Unable to Start Payment";

                message.textContent =
                  error.message ||
                  "Unable to create payment.";

              }

            }


            /*
             * ------------------------------------------------
             * START CASHFREE CHECKOUT
             * ------------------------------------------------
             */
            button.addEventListener(
              "click",
              async () => {

                if (
                  !paymentSessionId
                ) {
                  return;
                }


                button.disabled =
                  true;

                button.textContent =
                  "Opening Checkout...";

                message.textContent =
                  "";


                try {

                  const cashfree =
                    Cashfree({
                      mode:
                        "sandbox"
                    });


                  const result =
                    await cashfree.checkout({
                      paymentSessionId:
                        paymentSessionId,

                      redirectTarget:
                        "_self"
                    });


                  if (
                    result?.error
                  ) {

                    console.error(
                      "Cashfree checkout error:",
                      result.error
                    );

                    message.textContent =
                      "Unable to open payment checkout.";

                    button.disabled =
                      false;

                    button.textContent =
                      "Proceed to Pay";
                  }


                } catch (error) {

                  console.error(
                    "Checkout exception:",
                    error
                  );

                  message.textContent =
                    "Unable to open payment checkout.";

                  button.disabled =
                    false;

                  button.textContent =
                    "Proceed to Pay";

                }

              }
            );


            /*
             * Automatically create the order.
             */
            createOrder();

          </script>

        </body>

        </html>
        `,
        {
          status: 200,

          headers: {
            "Content-Type":
              "text/html; charset=UTF-8",

            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * --------------------------------------------------------
     * PAYMENT RETURN
     * --------------------------------------------------------
     *
     * Cashfree redirects the user's browser here.
     *
     * This route verifies payment status with Cashfree,
     * but DOES NOT activate the license.
     *
     * Activation happens through the webhook.
     * --------------------------------------------------------
     */
    if (
      request.method === "GET" &&
      url.pathname === "/payment-return"
    ) {
      const orderId =
        url.searchParams.get(
          "order_id"
        );

      if (!orderId) {
        return new Response(
          `
          <!DOCTYPE html>

          <html>

          <head>
            <meta charset="UTF-8">
            <title>
              Payment Error
            </title>
          </head>

          <body>

            <h1>
              Payment Error
            </h1>

            <p>
              Missing order ID.
            </p>

          </body>

          </html>
          `,
          {
            status: 400,

            headers: {
              "Content-Type":
                "text/html; charset=UTF-8",
            },
          }
        );
      }

      /*
       * Ask Cashfree for payment attempts.
       */
      const paymentResponse =
        await fetch(
          `https://sandbox.cashfree.com/pg/orders/${encodeURIComponent(
            orderId
          )}/payments`,
          {
            method: "GET",

            headers: {
              "x-client-id":
                env.CASHFREE_APP_ID,

              "x-client-secret":
                env.CASHFREE_SECRET_KEY,

              "x-api-version":
                "2025-01-01",

              Accept:
                "application/json",
            },
          }
        );

      if (!paymentResponse.ok) {

        const errorText =
          await paymentResponse.text();

        console.error(
          "Cashfree payment status error:",
          errorText
        );

        return new Response(
          `
          <!DOCTYPE html>

          <html>

          <head>

            <meta charset="UTF-8">

            <title>
              Payment Status
            </title>

          </head>

          <body>

            <h1>
              Unable to verify payment
            </h1>

            <p>
              Please try again later.
            </p>

          </body>

          </html>
          `,
          {
            status: 502,

            headers: {
              "Content-Type":
                "text/html; charset=UTF-8",
            },
          }
        );
      }

      const payments =
        await paymentResponse.json();

      const successfulPayment =
        Array.isArray(payments)
          ? payments.find(
              payment =>
                payment.payment_status ===
                "SUCCESS"
            )
          : null;

      const pendingPayment =
        Array.isArray(payments)
          ? payments.find(
              payment =>
                payment.payment_status ===
                "PENDING"
            )
          : null;

      let status =
        "FAILED";

      if (successfulPayment) {
        status = "SUCCESS";
      } else if (pendingPayment) {
        status = "PENDING";
      }

      let heading =
        "Payment Failed";

      let messageText =
        "The payment was not completed successfully.";

      if (status === "SUCCESS") {

        heading =
          "Payment Successful";

        messageText =
          "Payment verified successfully. PRO activation will be handled by the payment webhook.";

      } else if (status === "PENDING") {

        heading =
          "Payment Pending";

        messageText =
          "Your payment is still being processed. PRO will be activated after Cashfree confirms the payment.";

      }

      const statusClass =
        status === "SUCCESS"
          ? "success"
          : status === "PENDING"
          ? "pending"
          : "failed";

      return new Response(
        `
        <!DOCTYPE html>

        <html>

        <head>

          <meta charset="UTF-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >

          <title>
            KGP Placement Form Tracker - PRO Payment
          </title>

          <style>

            body {
              margin: 0;

              padding:
                40px 20px;

              font-family:
                Arial,
                Helvetica,
                sans-serif;

              background:
                #f5f7fb;

              color:
                #111827;

              text-align:
                center;
            }

            .card {
              max-width:
                520px;

              margin:
                60px auto;

              background:
                white;

              padding:
                40px;

              border-radius:
                16px;

              box-shadow:
                0 10px 30px
                rgba(0,0,0,.08);
            }

            h1 {
              margin-bottom:
                10px;
            }

            .status {
              font-size:
                22px;

              font-weight:
                bold;

              margin:
                20px 0;
            }

            .success {
              color:
                #16a34a;
            }

            .pending {
              color:
                #ca8a04;
            }

            .failed {
              color:
                #dc2626;
            }

            .order {
              margin-top:
                25px;

              padding:
                12px;

              background:
                #f3f4f6;

              border-radius:
                8px;

              word-break:
                break-all;

              font-size:
                13px;
            }

          </style>

        </head>

        <body>

          <div class="card">

            <h1>
              KGP Placement Form Tracker
            </h1>

            <h2>
              PRO Payment
            </h2>

            <div
              class="status ${statusClass}"
            >
              ${heading}
            </div>

            <p>
              ${messageText}
            </p>

            <div class="order">

              <strong>
                Order ID
              </strong>

              <br><br>

              ${orderId}

            </div>

          </div>

        </body>

        </html>
        `,
        {
          status: 200,

          headers: {
            "Content-Type":
              "text/html; charset=UTF-8",
          },
        }
      );
    }

    /*
     * --------------------------------------------------------
     * CASHFREE PAYMENT WEBHOOK
     * --------------------------------------------------------
     *
     * POST /payment-webhook
     * --------------------------------------------------------
     */
    if (
      request.method === "POST" &&
      url.pathname === "/payment-webhook"
    ) {
      /*
       * MUST read the raw body first.
       */
      const rawBody =
        await request.text();

      const signature =
        request.headers.get(
          "x-webhook-signature"
        );

      const timestamp =
        request.headers.get(
          "x-webhook-timestamp"
        );

      if (
        !signature ||
        !timestamp
      ) {
        console.error(
          "Missing Cashfree webhook signature headers"
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Missing webhook signature headers",
          },
          401
        );
      }

      /*
       * Generate expected signature.
       */
      const expectedSignature =
        await generateCashfreeSignature(
          timestamp,
          rawBody,
          env.CASHFREE_SECRET_KEY
        );

      /*
       * Verify signature BEFORE parsing JSON.
       */
      if (
        !safeCompare(
          signature,
          expectedSignature
        )
      ) {
        console.error(
          "Invalid Cashfree webhook signature"
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Invalid webhook signature",
          },
          401
        );
      }

      /*
       * Parse webhook JSON.
       */
      let payload;

      try {
        payload =
          JSON.parse(rawBody);
      } catch {
        return jsonResponse(
          {
            success: false,
            error:
              "Invalid webhook JSON payload",
          },
          400
        );
      }

      /*
       * Extract webhook values.
       */
      const orderId =
        payload?.data?.order?.order_id;

      const webhookPaymentId =
        payload?.data?.payment?.cf_payment_id;

      const webhookPaymentStatus =
        payload?.data?.payment?.payment_status;

      const eventType =
        payload?.type;

      console.log(
        "Cashfree webhook received:",
        {
          eventType,
          orderId,
          webhookPaymentId,
          webhookPaymentStatus,
        }
      );

      if (!orderId) {
        return jsonResponse(
          {
            success: false,
            error:
              "Missing order_id",
          },
          400
        );
      }

      /*
       * Only SUCCESS webhooks can activate PRO.
       */
      if (
        eventType !==
          "PAYMENT_SUCCESS_WEBHOOK" ||
        webhookPaymentStatus !==
          "SUCCESS"
      ) {
        return jsonResponse({
          success: true,

          message:
            "Webhook received but no activation required",

          order_id:
            orderId,

          status:
            webhookPaymentStatus ||
            "UNKNOWN",
        });
      }

      /*
       * ------------------------------------------------------
       * SERVER-SIDE PAYMENT VERIFICATION
       * ------------------------------------------------------
       */
      const paymentResponse =
        await fetch(
          `https://sandbox.cashfree.com/pg/orders/${encodeURIComponent(
            orderId
          )}/payments`,
          {
            method: "GET",

            headers: {
              "x-client-id":
                env.CASHFREE_APP_ID,

              "x-client-secret":
                env.CASHFREE_SECRET_KEY,

              "x-api-version":
                "2025-01-01",

              Accept:
                "application/json",
            },
          }
        );

      if (!paymentResponse.ok) {

        const errorText =
          await paymentResponse.text();

        console.error(
          "Cashfree payment verification failed:",
          errorText
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Could not verify payment with Cashfree",
          },
          502
        );
      }

      const payments =
        await paymentResponse.json();

      const successfulPayment =
        Array.isArray(payments)
          ? payments.find(
              payment =>
                payment.payment_status ===
                "SUCCESS"
            )
          : null;

      if (!successfulPayment) {

        console.error(
          "Webhook reported success but Cashfree API did not confirm success:",
          orderId
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Cashfree payment is not confirmed as successful",
          },
          400
        );
      }

      const paymentId =
        successfulPayment.cf_payment_id ||
        webhookPaymentId ||
        null;

      /*
       * ------------------------------------------------------
       * FIND LICENSE
       * ------------------------------------------------------
       */
      const license =
        await env
          .kgp_placement_form_tracker_db
          .prepare(
            `SELECT
               installation_id,
               order_id,
               payment_id,
               status,
               created_at,
               activated_at
             FROM licenses
             WHERE order_id = ?
             LIMIT 1`
          )
          .bind(orderId)
          .first();

      if (!license) {

        console.error(
          "No license record found for order:",
          orderId
        );

        return jsonResponse(
          {
            success: false,
            error:
              "No matching license record found",
          },
          404
        );
      }

      /*
       * ------------------------------------------------------
       * IDEMPOTENCY
       * ------------------------------------------------------
       *
       * Cashfree may send the webhook more than once.
       */
      if (
        license.status === "ACTIVE"
      ) {

        return jsonResponse({
          success: true,

          message:
            "License was already active",

          order_id:
            orderId,

          payment_id:
            license.payment_id ||
            paymentId,

          status:
            "ACTIVE",
        });
      }

      /*
       * ------------------------------------------------------
       * ACTIVATE LICENSE
       * ------------------------------------------------------
       */
      const activatedAt =
        Date.now();

      const updateResult =
        await env
          .kgp_placement_form_tracker_db
          .prepare(
            `UPDATE licenses
             SET
               payment_id = ?,
               status = 'ACTIVE',
               activated_at = ?
             WHERE
               order_id = ?
               AND status != 'ACTIVE'`
          )
          .bind(
            paymentId,
            activatedAt,
            orderId
          )
          .run();

      console.log(
        "License activation completed:",
        {
          orderId,
          paymentId,
          changes:
            updateResult.meta?.changes,
        }
      );

      return jsonResponse({
        success: true,

        message:
          "Payment verified and license activated",

        order_id:
          orderId,

        payment_id:
          paymentId,

        status:
          "ACTIVE",
      });
    }

    /*
     * --------------------------------------------------------
     * VERIFY LICENSE
     * --------------------------------------------------------
     *
     * POST /verify-license
     *
     * Body:
     *
     * {
     *   "installation_id": "..."
     * }
     * --------------------------------------------------------
     */
    if (
      request.method === "POST" &&
      url.pathname === "/verify-license"
    ) {
      let body;

      try {
        body =
          await request.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            error:
              "Invalid JSON body",
          },
          400
        );
      }

      const installationId =
        body?.installation_id;

      if (
        !installationId ||
        typeof installationId !== "string" ||
        installationId.length < 10 ||
        installationId.length > 200
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Invalid installation_id",
          },
          400
        );
      }

      /*
       * Look up installation.
       */
      const license =
        await env
          .kgp_placement_form_tracker_db
          .prepare(
            `SELECT
               installation_id,
               order_id,
               payment_id,
               status,
               activated_at
             FROM licenses
             WHERE installation_id = ?
             LIMIT 1`
          )
          .bind(installationId)
          .first();

      /*
       * No license.
       */
      if (!license) {
        return jsonResponse({
          success: true,

          pro: false,

          status:
            "NOT_FOUND",
        });
      }

      /*
       * Only ACTIVE means PRO.
       */
      const isPro =
        license.status ===
        "ACTIVE";

      return jsonResponse({
        success: true,

        pro:
          isPro,

        status:
          license.status,
      });
    }

    /*
     * --------------------------------------------------------
     * UNKNOWN ROUTE
     * --------------------------------------------------------
     */
    return jsonResponse(
      {
        success: false,
        error: "Not found",
      },
      404
    );
  },
};