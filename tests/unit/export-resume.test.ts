import { vi, describe, it, expect } from 'vitest'

vi.mock('../../app/lib/supabase', () => ({ getServiceClient: vi.fn() }))

import { buildExportFilename } from '../../app/lib/utils/export-resume'

describe('buildExportFilename', () => {
  it('builds initials_company_role format for a full set of inputs', () => {
    expect(buildExportFilename('Sesha Kadakia', 'Acme Corp', 'Senior Software Engineer'))
      .toBe('SK_Acme-Corp_Senior-Software-Engineer.docx')
  })

  it('uses up to four initials for longer names', () => {
    expect(buildExportFilename('Jean Claude Van Damme', 'Acme', 'Engineer'))
      .toBe('JCVD_Acme_Engineer.docx')
  })

  it('strips special characters from company and role', () => {
    expect(buildExportFilename('Jane Smith', 'AT&T', 'Sr. Engineer (Staff)'))
      .toBe('JS_AT-T_Sr-Engineer-Staff.docx')
  })

  it('falls back to resume.docx when only one part is available', () => {
    expect(buildExportFilename('Jane Smith', null, null)).toBe('resume.docx')
    expect(buildExportFilename('', 'Acme', 'Engineer')).toBe('resume.docx')
  })

  it('works with only company (no role)', () => {
    expect(buildExportFilename('Jane Smith', 'Acme', null)).toBe('JS_Acme.docx')
  })

  it('works with only role (no company)', () => {
    expect(buildExportFilename('Jane Smith', null, 'Engineer')).toBe('JS_Engineer.docx')
  })

  it('caps company at 30 characters', () => {
    const longCompany = 'A Very Long Company Name That Goes On And On'
    const result = buildExportFilename('Jane Smith', longCompany, 'Engineer')
    const companyPart = result.split('_')[1]
    expect(companyPart.length).toBeLessThanOrEqual(30)
  })

  it('caps role at 35 characters', () => {
    const longRole = 'Principal Software Engineer Platform Infrastructure And Reliability'
    const result = buildExportFilename('Jane Smith', 'Acme', longRole)
    const rolePart = result.split('_')[2].replace('.docx', '')
    expect(rolePart.length).toBeLessThanOrEqual(35)
  })

  it('handles single-word names gracefully', () => {
    expect(buildExportFilename('Madonna', 'Acme', 'Engineer')).toBe('M_Acme_Engineer.docx')
  })
})
