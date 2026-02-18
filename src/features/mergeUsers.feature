Feature: Merge User Actions UI Validation.

  @smoke @merge
  Scenario: Merge user page should load successfully
    Given Launch the application
    Then Login with admin credentials
    Then Admin should be logged in successfully
    Then Select Super admin role
    Then Navigate to Admin Dashboard
    Then Navigate to Organizations listing page
    Then Admin search org by id "orgId"
    Then Navigate to Access Organization page
    Then Click on Support Action dropdown
    Then Click on Merge Account option
    Then Merge user page should load successfully
   # Then Validate the UI elements on Merge user page
    Then Logout from the application