@ui @smoke
Feature: Storefront renders
  The storefront home page loads with products from the catalog, and a product
  detail page renders its name and price.

  Scenario: The storefront home page loads with products
    When I open the storefront home page
    Then the store brand "Sundry" is shown
    And at least 20 products are listed

  Scenario: A product detail page renders
    When I open the product page for "BK-001"
    Then the product name "Hardcover Notebook" is shown
    And the product price "$14.99" is shown
