import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User,
  Mail,
  Lock,
  Phone,
  MapPin,
  Building,
  Globe,
  Camera,
  ChevronRight,
  ChevronLeft,
  Check,
  Eye,
  EyeOff,
  X,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import api from '@/services/api';

interface RegistrationData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  avatar?: string;
}

const TOTAL_STEPS = 2;

const STEPS = [
  { label: 'Account', icon: User },
  { label: 'Address', icon: MapPin },
];

export default function RegisterWizardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login } = useAuthStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState<RegistrationData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    avatar: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof RegistrationData, string>>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof RegistrationData, string>> = {};

    if (step === 1) {
      if (!formData.name.trim()) newErrors.name = 'Full name is required';
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Enter a valid email address';
      }
      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof RegistrationData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return null;
    const fd = new FormData();
    fd.append('image', avatarFile);
    try {
      const res = await api.post('/api/admin/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.url;
    } catch {
      return null;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep) && currentStep < TOTAL_STEPS) {
      setCurrentStep((p) => p + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep((p) => p - 1);
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const registerResponse = await api.post('/auth/register', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      login(registerResponse.data);

      let avatarUrl = formData.avatar;
      if (avatarFile) {
        const uploaded = await uploadAvatar();
        if (uploaded) avatarUrl = uploaded;
      }

      if (formData.phone || formData.address || formData.city || formData.country || avatarUrl) {
        await api.post('/user/profile', {
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          country: formData.country,
          avatar: avatarUrl,
        });
      }

      toast.success('Account created successfully!');
      navigate('/');
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Registration failed. Please try again.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  /* ─────────────── STEP 1 ─────────────── */
  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-900">Create Your Account</h2>
        <p className="text-sm text-gray-500 mt-1">Let's get started with your basic information</p>
      </div>

      {/* Avatar Upload */}
      <div className="flex items-center gap-5 py-2">
        <div className="relative shrink-0">
          <div
            className="w-20 h-20 rounded-full overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => document.getElementById('avatar-input')?.click()}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-7 h-7 text-gray-400" />
            )}
          </div>
          {avatarPreview && (
            <button
              type="button"
              onClick={() => { setAvatarPreview(''); setAvatarFile(null); }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <input
            id="avatar-input"
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Profile Photo</p>
          <p className="text-xs text-gray-400 mt-0.5">Optional · JPG, PNG, GIF up to 10MB</p>
          <button
            type="button"
            onClick={() => document.getElementById('avatar-input')?.click()}
            className="mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Upload image
          </button>
        </div>
      </div>

      {/* Name */}
      <Field label="Full Name" required error={errors.name}>
        <InputWrapper icon={<User className="h-4 w-4 text-gray-400" />}>
          <input
            type="text"
            placeholder="John Doe"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            className={inputClass(!!errors.name)}
          />
        </InputWrapper>
      </Field>

      {/* Email */}
      <Field label="Email Address" required error={errors.email}>
        <InputWrapper icon={<Mail className="h-4 w-4 text-gray-400" />}>
          <input
            type="email"
            placeholder="john@example.com"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            className={inputClass(!!errors.email)}
          />
        </InputWrapper>
      </Field>

      {/* Password */}
      <Field label="Password" required error={errors.password}>
        <InputWrapper icon={<Lock className="h-4 w-4 text-gray-400" />} trailing={
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-gray-600">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a strong password"
            value={formData.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            className={inputClass(!!errors.password)}
          />
        </InputWrapper>
      </Field>

      {/* Confirm Password */}
      <Field label="Confirm Password" required error={errors.confirmPassword}>
        <InputWrapper icon={<Lock className="h-4 w-4 text-gray-400" />} trailing={
          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-gray-400 hover:text-gray-600">
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm your password"
            value={formData.confirmPassword}
            onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
            className={inputClass(!!errors.confirmPassword)}
          />
        </InputWrapper>
      </Field>

      <p className="text-xs text-gray-400">Password requirements: Minimum 6 characters</p>
    </div>
  );

  /* ─────────────── STEP 2 ─────────────── */
  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-900">Your Address</h2>
        <p className="text-sm text-gray-500 mt-1">Help us know where to deliver your orders</p>
      </div>

      <Field label="Phone Number">
        <InputWrapper icon={<Phone className="h-4 w-4 text-gray-400" />}>
          <input
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            className={inputClass(false)}
          />
        </InputWrapper>
      </Field>

      <Field label="Street Address">
        <InputWrapper icon={<MapPin className="h-4 w-4 text-gray-400" />}>
          <input
            type="text"
            placeholder="123 Main Street"
            value={formData.address}
            onChange={(e) => handleInputChange('address', e.target.value)}
            className={inputClass(false)}
          />
        </InputWrapper>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="City">
          <InputWrapper icon={<Building className="h-4 w-4 text-gray-400" />}>
            <input
              type="text"
              placeholder="New York"
              value={formData.city}
              onChange={(e) => handleInputChange('city', e.target.value)}
              className={inputClass(false)}
            />
          </InputWrapper>
        </Field>

        <Field label="Country">
          <InputWrapper icon={<Globe className="h-4 w-4 text-gray-400" />}>
            <input
              type="text"
              placeholder="United States"
              value={formData.country}
              onChange={(e) => handleInputChange('country', e.target.value)}
              className={inputClass(false)}
            />
          </InputWrapper>
        </Field>
      </div>

      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 mt-2">
        <p className="text-sm text-indigo-700 font-medium">Almost there! 🎉</p>
        <p className="text-xs text-indigo-500 mt-0.5">Address info is optional — you can update it from your profile anytime.</p>
      </div>
    </div>
  );

  /* ─────────────── LAYOUT ─────────────── */
  return (
    <div className="flex min-h-screen bg-white">
      {/* ── Left Panel ── */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">

          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-2">Smart S3r</p>
            <h1 className="text-3xl font-extrabold text-gray-900">Join Smart S3r</h1>
            <p className="mt-1.5 text-sm text-gray-500">Complete the steps below to create your account</p>
          </div>

          {/* Step Indicator */}
          <div className="mb-8">
            {/* Progress bar */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">Step {currentStep} of {TOTAL_STEPS}</span>
              <span className="text-xs font-semibold text-indigo-600">{Math.round((currentStep / TOTAL_STEPS) * 100)}% Complete</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
              />
            </div>

            {/* Step Bullets */}
            <div className="flex items-center gap-2 mt-4">
              {STEPS.map((step, idx) => {
                const n = idx + 1;
                const done = currentStep > n;
                const active = currentStep === n;
                return (
                  <div key={step.label} className="flex items-center">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                        done
                          ? 'bg-indigo-600 text-white'
                          : active
                            ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                            : 'bg-gray-100 text-gray-400'
                      }`}>
                        {done ? <Check className="w-4 h-4" /> : n}
                      </div>
                      <span className={`text-sm font-medium ${active ? 'text-gray-900' : done ? 'text-indigo-600' : 'text-gray-400'}`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className={`mx-3 h-px w-8 transition-colors duration-300 ${done ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="mb-8">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
            </div>

            <div>
              {currentStep < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Creating…
                    </>
                  ) : (
                    <>
                      Create Account
                      <Check className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Sign In Link */}
          <p className="mt-8 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="hidden relative lg:flex lg:w-1/2 overflow-hidden">
        <div className="absolute inset-0 bg-indigo-950">
          <img
            className="h-full w-full object-cover opacity-30"
            src="https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=2000&q=80"
            alt="Register background"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/80 via-indigo-900/60 to-purple-900/80" />
        </div>

        {/* Floating cards */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-16 text-white">
          <div className="w-full max-w-sm space-y-6">
            <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-green-400 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-900" />
                </div>
                <p className="text-sm font-medium">Free shipping on orders over $50</p>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center">
                  <Check className="w-4 h-4 text-blue-900" />
                </div>
                <p className="text-sm font-medium">Exclusive member discounts</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-400 flex items-center justify-center">
                  <Check className="w-4 h-4 text-purple-900" />
                </div>
                <p className="text-sm font-medium">Order tracking & history</p>
              </div>
            </div>

            <div>
              <h3 className="text-3xl font-bold leading-tight mb-3">
                The Future of Tech Shopping is Here
              </h3>
              <p className="text-sm text-indigo-200 leading-relaxed">
                Smart S3r brings you the latest electronics and gadgets at unbeatable prices — with a seamless shopping experience from start to finish.
              </p>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 text-sm font-semibold text-indigo-200 hover:text-white transition-colors"
            >
              Already a member? Sign in <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Small helper components ─── */

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function InputWrapper({
  icon,
  trailing,
  children,
}: {
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 pointer-events-none">{icon}</span>
      {children}
      {trailing && <span className="absolute right-3">{trailing}</span>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return [
    'w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border bg-white',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
    'placeholder:text-gray-400 transition-colors',
    hasError
      ? 'border-red-400 focus:ring-red-400'
      : 'border-gray-200 hover:border-gray-300',
  ].join(' ');
}
