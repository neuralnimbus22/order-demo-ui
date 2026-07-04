package com.neuralnimbus.orderdemoui.bdd.steps;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;

import com.neuralnimbus.orderdemoui.bdd.support.Browser;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

/**
 * Storefront rendering: the home grid renders products from the real catalog
 * (through the BFF) and a product detail page renders its name and price.
 */
public class StorefrontSteps {

    private final Browser browser;

    public StorefrontSteps(Browser browser) {
        this.browser = browser;
    }

    @When("I open the storefront home page")
    public void i_open_the_home_page() {
        browser.open("/");
    }

    @When("I open the product page for {string}")
    public void i_open_the_product_page(String sku) {
        browser.open("/products/" + sku);
    }

    @Then("the store brand {string} is shown")
    public void the_store_brand_is_shown(String brand) {
        // CSS uppercases the brand; assert on DOM textContent, not the rendering.
        assertThat(browser.domText("header-brand"), is(brand));
    }

    @Then("at least {int} products are listed")
    public void at_least_products_are_listed(int min) {
        browser.waitCountAtLeast("product-card", min);
        assertThat(browser.all("product-card").size(), greaterThanOrEqualTo(min));
    }

    @Then("the product name {string} is shown")
    public void the_product_name_is_shown(String name) {
        assertThat(browser.text("detail-name"), is(name));
    }

    @Then("the product price {string} is shown")
    public void the_product_price_is_shown(String price) {
        assertThat(browser.text("detail-price"), is(price));
        assertThat(browser.text("detail-price"), is(not("")));
    }
}
