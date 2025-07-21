/**
 * WhatsApp Flow Configurations
 * Contains flow definitions for various interactive flows
 */

export interface WhatsAppFlowData {
  screens: Array<{
    data?: Record<string, any>;
    id: string;
    layout: {
      children: Array<{
        children?: Array<{
          'input-type'?: string;
          label?: string;
          name?: string;
          required?: boolean;
          type: string;
          'data-source'?: Array<{
            id: string;
            title: string;
          }>;
          'on-click-action'?: {
            name: string;
            next?: {
              name: string;
              type: string;
            };
            payload?: Record<string, string>;
          };
        }>;
        name?: string;
        type: string;
      }>;
      type: string;
    };
    title: string;
    terminal?: boolean;
  }>;
  version: string;
}

/**
 * Proposal Creation Flow
 * Collects client details, project information, and payment details
 */
export const proposalCreationFlowData: WhatsAppFlowData = {
  "screens": [
    {
      "data": {},
      "id": "RECOMMEND",
      "layout": {
        "children": [
          {
            "children": [
              {
                "input-type": "text",
                "label": "Client name",
                "name": "Client_name_0ae25a",
                "required": true,
                "type": "TextInput"
              },
              {
                "input-type": "email",
                "label": "Client email",
                "name": "Client_email_54f17b",
                "required": true,
                "type": "TextInput"
              },
              {
                "input-type": "text",
                "label": "Project title",
                "name": "Project_title_a6c1ee",
                "required": true,
                "type": "TextInput"
              },
              {
                "input-type": "text",
                "label": "Project description",
                "name": "Project_description_e2314d",
                "required": true,
                "type": "TextInput"
              },
              {
                "label": "Deliverables",
                "name": "Deliverables_9a2501",
                "required": true,
                "type": "TextArea"
              },
              {
                "label": "Start date",
                "name": "Start_date_2d8cfe",
                "required": true,
                "type": "DatePicker"
              },
              {
                "label": "End date",
                "name": "End_date_e992c8",
                "required": true,
                "type": "DatePicker"
              },
              {
                "label": "Next",
                "on-click-action": {
                  "name": "navigate",
                  "next": {
                    "name": "screen_hawtww",
                    "type": "screen"
                  },
                  "payload": {
                    "screen_0_Client_name_0": "${form.Client_name_0ae25a}",
                    "screen_0_Client_email_1": "${form.Client_email_54f17b}",
                    "screen_0_Project_title_2": "${form.Project_title_a6c1ee}",
                    "screen_0_Project_description_3": "${form.Project_description_e2314d}",
                    "screen_0_Deliverables_4": "${form.Deliverables_9a2501}",
                    "screen_0_Start_date_5": "${form.Start_date_2d8cfe}",
                    "screen_0_End_date_6": "${form.End_date_e992c8}"
                  }
                },
                "type": "Footer"
              }
            ],
            "name": "flow_path",
            "type": "Form"
          }
        ],
        "type": "SingleColumnLayout"
      },
      "title": "Project Details"
    },
    {
      "data": {
        "screen_0_Client_name_0": {
          "__example__": "Example",
          "type": "string"
        },
        "screen_0_Client_email_1": {
          "__example__": "Example",
          "type": "string"
        },
        "screen_0_Project_title_2": {
          "__example__": "Example",
          "type": "string"
        },
        "screen_0_Project_description_3": {
          "__example__": "Example",
          "type": "string"
        },
        "screen_0_Deliverables_4": {
          "__example__": "Example",
          "type": "string"
        },
        "screen_0_Start_date_5": {
          "__example__": "Example",
          "type": "string"
        },
        "screen_0_End_date_6": {
          "__example__": "Example",
          "type": "string"
        }
      },
      "id": "screen_hawtww",
      "layout": {
        "children": [
          {
            "children": [
              {
                "input-type": "number",
                "label": "Payment amount",
                "name": "Payment_amount_f99fa4",
                "required": true,
                "type": "TextInput"
              },
              {
                "data-source": [
                  {
                    "id": "0_Crypto",
                    "title": "Crypto"
                  },
                  {
                    "id": "1_Bank_Transfer",
                    "title": "Bank Transfer"
                  },
                  {
                    "id": "2_Mixed",
                    "title": "Mixed"
                  }
                ],
                "label": "Payment Method",
                "name": "Payment_Method_a77f1c",
                "required": true,
                "type": "RadioButtonsGroup"
              },
              {
                "label": "Continue",
                "on-click-action": {
                  "name": "complete",
                  "payload": {
                    "screen_1_Payment_amount_0": "${form.Payment_amount_f99fa4}",
                    "screen_1_Payment_Method_1": "${form.Payment_Method_a77f1c}",
                    "screen_0_Client_name_0": "${data.screen_0_Client_name_0}",
                    "screen_0_Client_email_1": "${data.screen_0_Client_email_1}",
                    "screen_0_Project_title_2": "${data.screen_0_Project_title_2}",
                    "screen_0_Project_description_3": "${data.screen_0_Project_description_3}",
                    "screen_0_Deliverables_4": "${data.screen_0_Deliverables_4}",
                    "screen_0_Start_date_5": "${data.screen_0_Start_date_5}",
                    "screen_0_End_date_6": "${data.screen_0_End_date_6}"
                  }
                },
                "type": "Footer"
              }
            ],
            "name": "flow_path",
            "type": "Form"
          }
        ],
        "type": "SingleColumnLayout"
      },
      "terminal": true,
      "title": "Payment Info"
    }
  ],
  "version": "7.2"
};

/**
 * Parse WhatsApp flow response data into proposal data format
 */
export interface ProposalFlowResponse {
  screen_0_Client_name_0: string;
  screen_0_Client_email_1: string;
  screen_0_Project_title_2: string;
  screen_0_Project_description_3: string;
  screen_0_Deliverables_4: string;
  screen_0_Start_date_5: string;
  screen_0_End_date_6: string;
  screen_1_Payment_amount_0: string;
  screen_1_Payment_Method_1: string;
}

export function parseProposalFlowResponse(flowResponse: ProposalFlowResponse) {
  return {
    clientName: flowResponse.screen_0_Client_name_0,
    clientEmail: flowResponse.screen_0_Client_email_1,
    projectTitle: flowResponse.screen_0_Project_title_2,
    projectDescription: flowResponse.screen_0_Project_description_3,
    deliverables: flowResponse.screen_0_Deliverables_4,
    startDate: flowResponse.screen_0_Start_date_5,
    endDate: flowResponse.screen_0_End_date_6,
    paymentAmount: parseFloat(flowResponse.screen_1_Payment_amount_0),
    paymentMethod: flowResponse.screen_1_Payment_Method_1.replace(/^\d+_/, '') // Remove prefix like "0_", "1_", "2_"
  };
}