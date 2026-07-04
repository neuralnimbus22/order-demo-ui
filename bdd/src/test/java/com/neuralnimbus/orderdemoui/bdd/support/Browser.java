package com.neuralnimbus.orderdemoui.bdd.support;

import com.neuralnimbus.orderdemoui.bdd.config.Config;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

/**
 * Thin Selenium harness shared across step classes (one instance per scenario,
 * injected by cucumber-picocontainer). Headless Chrome is resolved by Selenium
 * Manager — no hardcoded chromedriver path. Elements are addressed by the app's
 * data-testid convention.
 */
public class Browser {

    public static final Duration TIMEOUT = Duration.ofSeconds(10);

    private WebDriver driver;

    public void start() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments(
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--window-size=1280,900");
        // Optional explicit Chrome/Chromium binary (e.g. in-cluster arm64 nodes
        // ship chromium, not google-chrome). Unset -> Selenium's default.
        String chromeBin = System.getenv("CHROME_BIN");
        if (chromeBin != null && !chromeBin.isBlank()) {
            options.setBinary(chromeBin);
        }
        driver = new ChromeDriver(options);
    }

    public void quit() {
        if (driver != null) {
            driver.quit();
            driver = null;
        }
    }

    public WebDriver driver() {
        return driver;
    }

    /** Navigate to a path relative to the configured base URL. */
    public void open(String path) {
        driver.get(Config.baseUrl() + path);
    }

    private By testId(String id) {
        return By.cssSelector("[data-testid='" + id + "']");
    }

    /** Wait until the element with the given testid is visible, then return it. */
    public WebElement waitVisible(String id) {
        return new WebDriverWait(driver, TIMEOUT)
                .until(ExpectedConditions.visibilityOfElementLocated(testId(id)));
    }

    public List<WebElement> all(String id) {
        return driver.findElements(testId(id));
    }

    /** Wait until at least {@code n} elements with the testid are present. */
    public void waitCountAtLeast(String id, int n) {
        new WebDriverWait(driver, TIMEOUT)
                .until(d -> d.findElements(testId(id)).size() >= n);
    }

    public void type(String id, String value) {
        WebElement el = waitVisible(id);
        el.clear();
        el.sendKeys(value);
    }

    public void click(String id) {
        waitVisible(id).click();
    }

    /** Wait until the browser URL's path equals {@code path}. */
    public void waitUrlPath(String path) {
        new WebDriverWait(driver, TIMEOUT).until(d -> {
            try {
                return path.equals(URI.create(d.getCurrentUrl()).getPath());
            } catch (RuntimeException e) {
                return false;
            }
        });
    }

    /**
     * The DOM textContent of an element (not getText()). The brand is rendered
     * uppercase via CSS text-transform, so getText() would return "SUNDRY" while
     * the DOM holds "Sundry" — assertions compare the DOM value.
     */
    public String domText(String id) {
        return waitVisible(id).getAttribute("textContent").trim();
    }

    public String text(String id) {
        return waitVisible(id).getText().trim();
    }
}
