export const S = {
  adminLogin: {
    signIn: ["#sap-link", "button#sap-link", "a#sap-link"],

    // Gigya renders login ID as data-gigya-name="loginID"
    email: [
      'input[data-gigya-name="loginID"]:visible',
      "input.gigya-input-text:visible",
      'input[name="username"]:visible',
      'input[aria-label="Email"]:visible',
    ],

    password: [
      'input[data-gigya-name="password"]:visible',
      "input.gigya-input-password:visible",
      'input[name="password"]:visible',
    ],

    submit: [
      "input.gigya-input-submit:visible",
      "button.gigya-input-submit:visible",
      'button:has-text("Log In"):visible',
      'button:has-text("Sign in"):visible',
      'button[type="submit"]:visible',
      'input[type="submit"]:visible',
    ],
    superAdminRole: [
      'a.circle_login:has-text("Super Administrator")',
      'a:has-text("Super Administrator")',
    ],
    admindashboard: {
      OrgListingNav: [
        '.huge-title:has-text("Organizations")',
        'div:has(.huge-title:has-text("Organizations"))',
      ],
    },

    orgListing: {
      searchInput: [
        'input[placeholder*="org_id"]',
        'input[type="text"]',
        'input[name="org_id"]',
      ],
      searchButton: [
        "#search",
        "button.search_icon.organization-btn-top",
        "button:has(.fa-search)",
      ],
    },

    orgListingActions: {
      orgActions: [
        'a.action_dropdown[data-toggle="dropdown"]',
        "a.action_dropdown",
        'a[data-toggle="dropdown"]',
      ],
      orgDetailsAction: [
        'a:has-text("Organization Details")',
        'a:has-text("Organisation Details")',
        'a[href*="manage_organization"]',
      ],
    },
    orgProducts: {
      orgProducts: ['a:has-text("Products")', 'a[href*="manage_product"]'],
      addProductLink: ['a.white_btn:has-text("Add Product")'],
      addProductdrop: ["#filter-option pull-left"],

      productDropdown: [
        'span.filter-option:has-text("Select Product"), span.filter-option.pull-left',
        'button.dropdown-toggle:has(.filter-option:has-text("Select Product"))',
        '.filter-option.pull-left:has-text("Select Product")',
      ],
      productSearchInput: ["#autocompleteProduct"],
      productList: ["#scrollProduct"],
      productOptionByText: (text: string) =>
        `#scrollProduct li a span.text:has-text("${text}")`,
      organizationPayLabel: ['label[for="organization_pay"]'],
      unlimitedRadio: [
        "input#unlimited",
        'input[name="license_limit_type"][value="2_unlimited"]',
        'label:has-text("Unlimited")',
      ],
      submitAddProduct: ["#submitBtn"],
      courseVisibleText: (text: string) => `text=${text}`,
    },
    manageStudents: {
      // ✅ Navigation
      manageStudentsNav: ['a:has-text("Manage Students")'],

      // ✅ Import Demographic Data button (top right)
      importDemographicBtn: [
        'button:has-text("Import Demographic Data")',
        'a:has-text("Import Demographic Data")',
      ],

      // ✅ Download CSV template link inside modal
      downloadTemplateLink: [
        'a:has-text("download a formatted blank CSV file")',
        'a[href*="download"]',
      ],

      // ✅ File input (Choose File)
      chooseFileInput: ['input[type="file"]'],

      // ✅ Upload button inside modal
      uploadBtn: ['button:has-text("Upload")', 'input[value="Upload"]'],

      // ✅ Search input (User ID / First Name / filters)
      searchUserInput: [
        'input[placeholder*="User"]',
        'input[name*="user"]',
        'input[id*="user"]',
      ],

      // ✅ Search icon / button
      searchBtn: [
        "button:has(i.fa-search)",
        "a:has(i.fa-search)",
        'button:has-text("Search")',
      ],
    },
  },
} as const;
