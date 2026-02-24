Feature: Admin Login

  @smoke @test @sam @useremail
  Scenario: Super Admin login successfully
    Given Launch the application
    Then Login with admin credentials
    Then Admin should be logged in successfully
    Then Select Super admin role
    Then Navigate to Admin Dashboard
    Then Navigate to Organizations listing page
    Then Admin search org by id "orgId"
    Then Navigate to Organization details page
    Then Navigate to products page
    Then Check if course is available or add the course as "courseId" and "courseId1"
    Then Navigate to manage students page
    Then Import 10 students from file "students.csv"

    
    
    @test @useremail
Scenario: Super Admin login successfully
    Given Launch the application
    Then Login with admin credentials
    Then Admin should be logged in successfully
    Then Select Super admin role
    Then Navigate to Admin Dashboard
    Then Navigate to Organizations listing page
    Then Admin search org by id "orgId3"
    Then Navigate to Organization details page
    Then Navigate to products page
    Then Check if course is available or add the course as "courseId" and "courseId1"
    Then Navigate to manage students page
    Then Import 1 students from file "students.csv"