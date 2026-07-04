@ui @session
Feature: Browser login (user-session via the UI)
  A user logs in through the browser against the real user-session service; a
  successful login lands on the account page with the email in the header.

  Scenario: A user logs in through the browser
    Given I am on the login page
    When I sign in with the seeded demo account
    Then I land on the account page
    And the header shows my email "demo@example.com"
