package com.neuralnimbus.orderdemoui.bdd.steps;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.is;

import com.neuralnimbus.orderdemoui.bdd.support.Browser;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

/**
 * Browser login through the UI, backed by the real user-session service via the
 * BFF. Uses the seeded demo account; success routes to /account and the header
 * shows the signed-in email.
 */
public class LoginSteps {

    private static final String SEEDED_EMAIL = "demo@example.com";
    private static final String SEEDED_PASSWORD = "demo-password";

    private final Browser browser;

    public LoginSteps(Browser browser) {
        this.browser = browser;
    }

    @Given("I am on the login page")
    public void i_am_on_the_login_page() {
        browser.open("/login");
        browser.waitVisible("login-email");
    }

    @When("I sign in with the seeded demo account")
    public void i_sign_in_with_the_seeded_account() {
        browser.type("login-email", SEEDED_EMAIL);
        browser.type("login-password", SEEDED_PASSWORD);
        browser.click("login-submit");
    }

    @Then("I land on the account page")
    public void i_land_on_the_account_page() {
        browser.waitUrlPath("/account");
    }

    @Then("the header shows my email {string}")
    public void the_header_shows_my_email(String email) {
        assertThat(browser.text("header-email"), is(email));
    }
}
