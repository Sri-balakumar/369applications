# Vehicle Maintenance Module - User Manual

---

## 1. Overview

The Vehicle Maintenance module allows you to create, track, and validate vehicle maintenance records from both the **mobile app** and **Odoo ERP**. Records created from the app are synced directly to Odoo in real-time.

---

## 2. Getting Started

### Accessing from the Mobile App
1. Open the app and navigate to the **Home** screen
2. Tap on **Vehicle Maintenance** from the options menu
3. You will see the **Vehicle Maintenance Dashboard**

### Accessing from Odoo
1. Log in to your Odoo instance
2. Click on **Vehicle Maintenance** in the left sidebar menu
3. Select **Maintenance Records** to view all records

---

## 3. Mobile App

### 3.1 Dashboard Screen

The dashboard shows all maintenance records for a selected date.

- **Calendar**: Tap any date to view records for that day
- **Record Cards**: Each card displays:
  - Reference number (e.g., VM-0001)
  - Driver name
  - Vehicle name and number plate
  - Maintenance type
  - Amount and current KM reading
- **Tap a card** to open and edit the record
- **Tap the + button** (bottom-right) to create a new record

### 3.2 Creating a New Maintenance Record

Tap the **+** button on the dashboard to open the maintenance form.

#### Step 1: Vehicle Information

| Field | Description | How to Fill |
|-------|-------------|-------------|
| **Date** | Date of maintenance | Tap to open date picker, select date |
| **Vehicle** * | Vehicle being serviced | Tap dropdown, select from list |
| **Driver** | Driver of the vehicle | Auto-filled when vehicle is selected |
| **Number Plate** | Vehicle license plate | Auto-filled when vehicle is selected |

> Fields marked with * are required.

#### Step 2: Maintenance Details

| Field | Description | How to Fill |
|-------|-------------|-------------|
| **Maintenance Type** * | Type of service performed | Tap dropdown, select from list |
| **Handover To** | Person receiving the vehicle | Tap dropdown, select from contacts list |
| **Current KM** | Current odometer reading | Enter number manually |
| **Amount** | Cost of maintenance | Enter number manually |

**Available Maintenance Types:**
1. Oil & Filter Change
2. Body Wash
3. Tyre Change
4. Petrol Filing
5. Vehicle Hand Over
6. Daily Checks for Vehicle
7. Parking

#### Step 3: Handover Signatures

Two signature fields are available for recording handover:

**Handover From (Person handing over the vehicle):**
1. Tap **"Tap to Sign"**
2. A full-screen signature pad opens
3. Sign using your finger on the screen
4. Tap **Save** to confirm, or **Clear** to start over
5. After saving, a preview of the signature is shown
6. Use **Re-sign** to sign again, or **Clear** to remove

**Handover To (Person receiving the vehicle):**
- Same process as above

> Signatures are sent to Odoo and stored as images in the corresponding record.

#### Step 4: Attachment Details

To attach a photo (e.g., vehicle condition, invoice):
1. Tap the **green camera button**
2. Choose an option:
   - **Camera** - Take a photo using your phone camera
   - **Gallery** - Select an existing photo from your phone
   - **Cancel** - Close without selecting
3. Once selected, the button turns dark green with a checkmark
4. Text shows **"Image selected"** below the button

#### Step 5: Remarks

- Enter any additional notes or comments about the maintenance
- This is a free-text field

#### Step 6: Submit

- Tap the **Submit** button at the bottom
- A success message will appear: *"Maintenance record created"*
- You will be taken back to the dashboard

### 3.3 Editing an Existing Record

1. On the dashboard, tap on any record card
2. The form opens with all existing data pre-filled
3. Make your changes
4. Tap **Update** to save changes

---

## 4. Odoo ERP

### 4.1 Viewing Records

1. Go to **Vehicle Maintenance > Maintenance Records**
2. The list view shows all records with columns:
   - Ref, Date, Driver, Number Plate, Maintenance Type, Current KM, Amount, Validated, Remarks

### 4.2 Creating a Record in Odoo

1. Click **CREATE** button
2. Fill in the form fields:
   - **Left column**: Date, Vehicle (dropdown), Driver (dropdown), Number Plate
   - **Right column**: Maintenance Type (dropdown), Handover To, Company, Validate checkbox, Validated By, Validation Date
3. Enter **Current KM** and **Amount**
4. Sign in the **Handover From** and **Handover To** signature pads
5. Add **Image URL** under Attachment Details if needed
6. Add **Remarks** at the bottom
7. Click **SAVE**

> A unique reference number (VM-XXXX) is automatically assigned to each record.

### 4.3 Validating a Record

Validation confirms that a maintenance record has been reviewed and approved.

1. Open the record you want to validate
2. Click the **VALIDATE** button at the top of the form
3. The following fields are automatically updated:
   - **Validate**: Checked (True)
   - **Validated By**: Your username
   - **Validation Date**: Today's date
4. The VALIDATE button disappears after validation

> Only unvalidated records show the VALIDATE button.

### 4.4 Managing Maintenance Types

To add, edit, or remove maintenance types:

1. Go to **Vehicle Maintenance > Configuration > Maintenance Types**
2. Click **CREATE** to add a new type
3. Enter the type name and click **SAVE**
4. To edit, click on an existing type, modify the name, and save

---

## 5. Reference Number Format

Each maintenance record receives an auto-generated reference number:

- **Format**: VM-XXXX (e.g., VM-0001, VM-0002, VM-0003...)
- Numbers increment automatically
- Reference numbers are unique and cannot be changed

---

## 6. Data Flow: App to Odoo

When a record is created or updated from the mobile app:

1. User fills the form in the app
2. **Signatures** are captured as images and converted to base64 format
3. **Photos** are converted to base64 format
4. All data is sent to Odoo via JSON-RPC API
5. Record appears immediately in Odoo under Maintenance Records
6. Signatures show in the Handover From / Handover To signature fields
7. Photos are stored in the Image URL field

---

## 7. Field Reference

| Field | App | Odoo | Type | Notes |
|-------|-----|------|------|-------|
| Ref | Read-only | Auto-generated | Text | VM-XXXX format |
| Date | Date picker | Date picker | Datetime | Defaults to today |
| Vehicle | Dropdown | Dropdown | Selection | Required |
| Driver | Auto-filled | Dropdown | Selection | From vehicle |
| Number Plate | Auto-filled | Text | Text | From vehicle |
| Maintenance Type | Dropdown | Dropdown | Selection | Required |
| Handover To | Dropdown | Dropdown | Selection | Contact/Partner |
| Company | N/A | Dropdown | Selection | Defaults to current |
| Current KM | Number input | Number input | Decimal | 2 decimal places |
| Amount | Number input | Number input | Decimal | 4 decimal places |
| Handover From | Signature pad | Signature widget | Image/Binary | Drawn signature |
| Handover To | Signature pad | Signature widget | Image/Binary | Drawn signature |
| Image URL | Camera/Gallery | Text/Image | Image/Text | Photo attachment |
| Remarks | Text input | Text input | Text | Multi-line |
| Validate | N/A | Checkbox/Button | Boolean | Set via VALIDATE button |
| Validated By | N/A | Auto-filled | User | Set on validation |
| Validation Date | N/A | Auto-filled | Date | Set on validation |

---

## 8. Troubleshooting

| Issue | Solution |
|-------|----------|
| Vehicle list is empty | Check that vehicles are configured in Odoo Fleet module |
| Maintenance type list is empty | Go to Configuration > Maintenance Types and add types |
| Handover To list is empty | Ensure contacts/partners exist in Odoo |
| Signature not showing in Odoo | Ensure the record was saved after signing |
| Camera/Gallery not working | Grant camera and storage permissions to the app |
| Record not appearing in Odoo | Check network connection to the Odoo server |
| "Please select a vehicle" error | Vehicle field is required - select a vehicle first |
| "Please select a maintenance type" error | Maintenance type is required - select one first |

---

## 9. Quick Reference

### Mobile App Workflow
```
Open App > Vehicle Maintenance > Dashboard
    |
    +-- View records by date (Calendar)
    |
    +-- Create new record (+)
    |       |
    |       +-- Select Vehicle (auto-fills driver & plate)
    |       +-- Select Maintenance Type
    |       +-- Select Handover To (optional)
    |       +-- Enter KM and Amount
    |       +-- Sign Handover From / To (optional)
    |       +-- Attach photo (optional)
    |       +-- Add remarks (optional)
    |       +-- Submit
    |
    +-- Edit existing record (tap card)
            |
            +-- Modify fields
            +-- Update
```

### Odoo Workflow
```
Vehicle Maintenance > Maintenance Records
    |
    +-- View all records (List view)
    |
    +-- Open record (Form view)
    |       |
    |       +-- Review details
    |       +-- Click VALIDATE to approve
    |
    +-- Create new record
    |       |
    |       +-- Fill form > Save
    |
    +-- Configuration > Maintenance Types
            |
            +-- Add / Edit / Delete types
```

---

*Document Version: 1.0*
*Module: Vehicle Maintenance (vehicle_maintenance)*
*Odoo Version: 19.0*
