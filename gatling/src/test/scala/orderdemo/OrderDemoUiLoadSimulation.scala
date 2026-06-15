package orderdemo

import scala.concurrent.duration._
import io.gatling.core.Predef._
import io.gatling.core.structure.{ScenarioBuilder, PopulationBuilder}
import io.gatling.http.Predef._

/**
 * Load test of the order-demo-ui BFF — the Scala-DSL sibling of the JMeter plan
 * (jmeter/order-demo-load.jmx). Same endpoints, comparable profile, same
 * posture, so the two tools are a fair side-by-side ("here's the same load,
 * authored in XML vs code").
 *
 *  - Loads the BFF entry points, NOT the backend directly: GET /api/products
 *    fans out to product-catalog through the BFF; GET /api/health is the cheap
 *    no-fan-out baseline.
 *  - Profile from -D system properties (JMeter-matched defaults); run.sh maps
 *    env (USERS/RAMP/DURATION/MAXMS) -> -D.
 *  - Reads E2E_BASE_URL (default http://localhost:3000) — the same single source
 *    of truth every suite uses. The app is assumed ALREADY RUNNING.
 *  - GETs by default. POST /api/auth/login is OPT-IN (-Dauth=true). POST
 *    /api/checkout is intentionally NOT loaded — it places real correlation-id
 *    orders and would pollute the system under test.
 *  - Assertions make it a TEST: zero failed requests AND p95 < maxms. Gatling
 *    fails the build natively on breach, so `mvn gatling:test` exits non-zero —
 *    the gate is the tool's own exit code.
 */
class OrderDemoUiLoadSimulation extends Simulation {

  private def strProp(name: String, default: String): String =
    sys.props.get(name).orElse(sys.env.get(name)).getOrElse(default)

  private def intProp(name: String, default: Int): Int =
    sys.props.get(name).orElse(sys.env.get(name)).map(_.trim.toInt).getOrElse(default)

  // E2E_BASE_URL is passed as a -D by run.sh (and also read from the env as a
  // fallback) so it reaches the forked Gatling JVM regardless.
  val baseUrl: String = strProp("E2E_BASE_URL", "http://localhost:3000")

  val users: Int       = intProp("users", 20)
  val ramp: Int        = intProp("ramp", 10)
  val durationS: Int   = intProp("duration", 30)
  val maxMs: Int       = intProp("maxms", 1500)
  val includeAuth: Boolean = strProp("auth", "false").equalsIgnoreCase("true")

  val authEmail: String    = strProp("authemail", "demo@example.com")
  val authPassword: String = strProp("authpassword", "demo-password")

  val httpProtocol = http
    .baseUrl(baseUrl)
    .acceptHeader("application/json")
    .userAgentHeader("gatling-order-demo-ui-load")

  // Read load — the idempotent GETs, same endpoints as the JMeter plan.
  val readLoad = scenario("Read load (GETs)")
    .exec(http("GET /api/products").get("/api/products").check(status.is(200)))
    .pause(200.milliseconds)
    .exec(http("GET /api/health").get("/api/health").check(status.is(200)))

  // Opt-in authenticated load (off unless -Dauth=true). Mints real JWTs and
  // needs user-session reachable — noisier than the GETs.
  val authLoad = scenario("Auth load (POST /api/auth/login)")
    .exec(
      http("POST /api/auth/login")
        .post("/api/auth/login")
        .header("Content-Type", "application/json")
        .body(StringBody(s"""{"email":"$authEmail","password":"$authPassword"}"""))
        .check(status.is(200))
    )

  // Closed model: ramp to `users` concurrent virtual users over `ramp`s, then
  // hold for `durationS`s — comparable (not byte-identical) to JMeter's thread
  // ramp + scheduler hold. (Gatling's inject/setUp are (head, tail*) signatures,
  // so the steps are passed explicitly rather than splatted from a Seq.)
  private def injected(s: ScenarioBuilder): PopulationBuilder =
    s.inject(
      rampConcurrentUsers(1).to(users).during(ramp.seconds),
      constantConcurrentUsers(users).during(durationS.seconds)
    )

  val setup =
    if (includeAuth) setUp(injected(readLoad), injected(authLoad))
    else setUp(injected(readLoad))

  setup
    .protocols(httpProtocol)
    .assertions(
      global.failedRequests.count.is(0L),
      global.responseTime.percentile(95.0).lt(maxMs)
    )
}
